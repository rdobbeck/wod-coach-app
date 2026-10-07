# Ask AI Saved Threads and Client Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask AI conversations survive reloads by living in the database, and a coach can switch on Ask AI for an individual client, who then edits their own upcoming training with the coach notified and able to undo.

**Architecture:** One new table `AiThread` mirrors the panel's in-memory message list per (user, client). A shared `aiAccess(clientId)` helper replaces `coachOf` in the AI routes and answers two questions at once: may this session use Ask AI about this client, and which coach's allowance pays. `AiChangeSet.appliedById` records who applied each batch so the coach page can list client edits with Undo.

**Tech Stack:** Next.js 14 app router, Prisma on Supabase Postgres (schemas `public` = prod, `preview` = local/tests), NextAuth sessions, Playwright e2e against a local dev server, web-push via `lib/notify.ts`.

**Spec:** `docs/superpowers/specs/2026-10-06-ai-threads-and-client-ask-ai-design.md`

## Global Constraints

- No em dashes or en dashes in any user-facing copy or code comments (project rule; `noLongDashes` exists in `lib/text.ts`).
- The deploy guard (`scripts/check-db-schema.ts`) fails the Vercel build if production lacks any column in `prisma/schema.prisma`. Run `scripts/create-ai-thread.ts public` before pushing to master. Tests run against `preview`; run the script with `preview` first.
- Tests: `PW_PORT=3012 npx playwright test <file> --reporter=list` from this worktree (`~/wod-coach-ai`). Port 3011 is held by another checkout's dev server.
- Commit after every task with the attribution trailer:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Atx2UWBbtZNFVs3pWf1278
  ```
- Thread message lists are trimmed to the last 20 entries on save; `failed` messages are never saved.
- `canAskAi` defaults to `false`; `appliedById` is nullable (existing rows stay null and count as coach-applied).

## Review Focus

1. A restored pending proposal whose session has since been completed or moved to the past: Apply must skip it with the existing "not found, already done, or in the past" message, not crash. Test added in Task 4.
2. A client whose coach is on the Free or Coach plan (no assistant) with `canAskAi` somehow true: the assist route must return the existing 402 funding error, not a 500. Test added in Task 2.
3. A client with two coach links: funding goes to the active link with the earliest `startDate`; a second coach of that client must still be able to undo. Test added in Task 7.
4. A thread PUT with junk (non-array, 500 messages, 1 MB text): must be rejected or trimmed, never stored raw. Test added in Task 3.
5. Coach turns `canAskAi` off while the client has the panel open: the next client call must get 403 and the panel must show the error rather than a blank reply. Test added in Task 6.

---

### Task 1: Schema and migration script

**Files:**
- Modify: `prisma/schema.prisma` (ClientProfile ~line 187, AiChangeSet ~line 833)
- Create: `scripts/create-ai-thread.ts`

**Interfaces:**
- Produces: `prisma.aiThread` model `{ id, userId, clientId, messages: Json, createdAt, updatedAt }` unique on `(userId, clientId)`; `ClientProfile.canAskAi: boolean`; `AiChangeSet.appliedById: string | null`.

- [ ] **Step 1: Add the fields and model to the schema**

In `prisma/schema.prisma`, after `canMoveWorkouts`:

```prisma
  canAskAi             Boolean   @default(false) // client may use Ask AI on their own training (spends the coach's allowance)
```

In `model AiChangeSet`, after `clientId`:

```prisma
  appliedById String? // who clicked Apply: the coach or the client; null = coach (rows from before this column)
```

After `model AiChangeSet { ... }`:

```prisma
// One Ask AI conversation per person per client, so the panel survives a
// reload. `messages` is the panel's own Msg[]; see components/coach/AiAssistant.tsx.
model AiThread {
  id        String   @id @default(cuid())
  userId    String
  clientId  String
  messages  Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, clientId])
}
```

- [ ] **Step 2: Write the idempotent create script**

`scripts/create-ai-thread.ts`:

```ts
/**
 * Saved Ask AI threads and client access. Safe to re-run.
 *   npx tsx scripts/create-ai-thread.ts preview   # local and test data
 *   npx tsx scripts/create-ai-thread.ts public    # production, BEFORE pushing
 */
import { config } from "dotenv"
config({ path: ".env.local" })
import { PrismaClient } from "@prisma/client"
const schema = process.argv[2]
if (!schema) throw new Error("usage: create-ai-thread.ts <schema>")
const base = process.env.POSTGRES_URL_NON_POOLING!
const p = new PrismaClient({ datasources: { db: { url: `${base}${base.includes("?") ? "&" : "?"}schema=${schema}` } } })
const s = `"${schema}"`
async function main() {
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${s}."AiThread" (
    "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "clientId" TEXT NOT NULL, "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  await p.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "AiThread_userId_clientId_key" ON ${s}."AiThread"("userId","clientId")`)
  await p.$executeRawUnsafe(`ALTER TABLE ${s}."ClientProfile" ADD COLUMN IF NOT EXISTS "canAskAi" BOOLEAN NOT NULL DEFAULT false`)
  await p.$executeRawUnsafe(`ALTER TABLE ${s}."AiChangeSet" ADD COLUMN IF NOT EXISTS "appliedById" TEXT`)
  const cols = await p.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = $1
     AND ((table_name = 'AiThread') OR (table_name = 'ClientProfile' AND column_name = 'canAskAi') OR (table_name = 'AiChangeSet' AND column_name = 'appliedById')) ORDER BY 1, 2`,
    schema,
  )
  console.log(schema, "->", cols.map((c) => `${c.table_name}.${c.column_name}`).join(", "))
}
main().catch((e) => console.log("ERR", String(e.message).split("\n").filter(Boolean).pop())).finally(() => p.$disconnect())
```

- [ ] **Step 3: Run against preview and regenerate the client**

Run: `npx tsx scripts/create-ai-thread.ts preview && npx prisma generate`
Expected: a line listing `AiChangeSet.appliedById, AiThread.clientId, ... ClientProfile.canAskAi`, then "Generated Prisma Client".

- [ ] **Step 4: Typecheck and run the drift check against preview**

Run: `npx tsc --noEmit && DB_SCHEMA=preview npx tsx scripts/check-db-schema.ts --check`
Expected: no tsc output; `[schema-check] preview: every column the code reads is present`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma scripts/create-ai-thread.ts
git commit -m "Schema: AiThread, ClientProfile.canAskAi, AiChangeSet.appliedById"
```

---

### Task 2: Access helper and the three existing AI routes

**Files:**
- Create: `lib/ai/access.ts`
- Modify: `app/api/ai/assist/route.ts`, `app/api/ai/assist/apply/route.ts`, `app/api/ai/assist/undo/route.ts`
- Modify: `lib/ai/apply.ts` (`applyChanges` signature, `undoChangeSet` permission)
- Test: `tests/ai-assist.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export type AiAccess = { viewer: "coach" | "client"; userId: string; coachId: string }
  export async function aiAccess(clientId: string): Promise<AiAccess | { denied: 401 | 403 }>
  export async function applyChanges(coachId: string, clientId: string, request: string, changes: ChangeInput[], appliedById: string)
  export async function undoChangeSet(userId: string, changeSetId: string)   // userId may be a coach of the client or the applier
  ```
- Consumes: Task 1 columns.

- [ ] **Step 1: Write the failing API tests**

Append to `tests/ai-assist.spec.ts` after the "only a coach of that client can use the assistant" test:

```ts
async function clientContext(browser: import("@playwright/test").Browser) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
  return { ctx, page }
}

test("a client may use the assistant only when their coach switched it on", async ({ browser }) => {
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: false } })
  const { ctx, page } = await clientContext(browser)
  const off = await page.request.post("/api/ai/assist", { data: { clientId, message: "hi" } })
  expect(off.status()).toBe(403)
  expect((await off.json()).error).toMatch(/hasn't switched/i)
  // A client can never ask about someone else, switched on or not.
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: true } })
  const other = await page.request.post("/api/ai/assist", { data: { clientId: otherId, message: "hi" } })
  expect(other.status()).toBe(401)
  // Switched on: the call reaches funding. The test coach has no plan and no balance, so 402 proves the gate opened.
  await prisma.coachProfile.updateMany({ where: { userId: coachId }, data: { aiBalanceCents: 0 } })
  const on = await page.request.post("/api/ai/assist", { data: { clientId, message: "hi" } })
  expect(on.status()).toBe(402)
  await ctx.close()
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: false } })
})

test("apply records who applied, and undo is open to the applier and to any coach of the client", async ({ page, browser }) => {
  const w = await seedSession(`${PREFIX}Who Applied`)
  const [squat] = w.exercises
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: true } })
  const { ctx, page: cp } = await clientContext(browser)
  const res = await cp.request.post("/api/ai/assist/apply", {
    data: { clientId, request: "client request", changes: [{ action: "modify", workoutId: w.id, exerciseId: squat.id, newPrescription: "3x5 @ RPE 8" }] },
  })
  expect(res.status(), await res.text()).toBe(200)
  const { changeSetId } = await res.json()
  const set = await prisma.aiChangeSet.findUniqueOrThrow({ where: { id: changeSetId } })
  expect(set.appliedById).toBe(clientId)
  expect(set.coachId).toBe(coachId)
  // The coach can undo a batch the client applied.
  const undo = await page.request.post("/api/ai/assist/undo", { data: { changeSetId } })
  expect(undo.status()).toBe(200)
  expect((await prisma.workoutExercise.findUniqueOrThrow({ where: { id: squat.id } })).prescription).toBe("3x5 @ RPE 7, rest 2 min")
  // A second batch, undone by the client themself.
  const res2 = await cp.request.post("/api/ai/assist/apply", {
    data: { clientId, request: "again", changes: [{ action: "modify", workoutId: w.id, exerciseId: squat.id, newPrescription: "3x5 @ RPE 9" }] },
  })
  const { changeSetId: id2 } = await res2.json()
  const undo2 = await cp.request.post("/api/ai/assist/undo", { data: { changeSetId: id2 } })
  expect(undo2.status()).toBe(200)
  await ctx.close()
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: false } })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `PW_PORT=3012 npx playwright test tests/ai-assist.spec.ts -g "switched it on|who applied" --reporter=list`
Expected: FAIL. First test: status 401 where 403 expected. Second: `appliedById` undefined / undo 401 for the client.

- [ ] **Step 3: Write the access helper**

`lib/ai/access.ts`:

```ts
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * Who may use Ask AI about `clientId`, and whose allowance pays.
 *
 * A coach of the client pays for themselves. The client may ask about their
 * own training once their coach switched it on; the active coach link with
 * the earliest start date is the one that pays. Everyone else is turned away:
 * 403 when it is the client with the switch off (so the page can explain),
 * 401 otherwise.
 */
export type AiAccess = { viewer: "coach" | "client"; userId: string; coachId: string }
export type AiDenied = { denied: 401 | 403 }

export const CLIENT_OFF_MESSAGE = "Your coach hasn't switched on Ask AI for you yet."

export async function aiAccess(clientId: string): Promise<AiAccess | AiDenied> {
  const session = await getServerSession(authOptions)
  if (!session) return { denied: 401 }
  const userId = session.user.id

  if (session.user.role === "COACH") {
    const link = await prisma.clientCoach.findUnique({ where: { clientId_coachId: { clientId, coachId: userId } } })
    return link ? { viewer: "coach", userId, coachId: userId } : { denied: 401 }
  }

  if (userId !== clientId) return { denied: 401 }
  const [profile, link] = await Promise.all([
    prisma.clientProfile.findUnique({ where: { userId: clientId }, select: { canAskAi: true } }),
    prisma.clientCoach.findFirst({ where: { clientId, status: "ACTIVE" }, orderBy: { startDate: "asc" }, select: { coachId: true } }),
  ])
  if (!link) return { denied: 401 }
  if (!profile?.canAskAi) return { denied: 403 }
  return { viewer: "client", userId, coachId: link.coachId }
}

export const isDenied = (a: AiAccess | AiDenied): a is AiDenied => "denied" in a

/** The JSON response for a denial, so every AI route says the same thing. */
export function denialResponse(a: AiDenied) {
  return Response.json({ error: a.denied === 403 ? CLIENT_OFF_MESSAGE : "Unauthorized", code: a.denied === 403 ? "AI_OFF" : undefined }, { status: a.denied })
}
```

- [ ] **Step 4: Record the applier and widen undo in `lib/ai/apply.ts`**

Change the `applyChanges` signature and the `aiChangeSet.create` call:

```ts
export async function applyChanges(coachId: string, clientId: string, request: string, changes: ChangeInput[], appliedById: string) {
  // ... unchanged body ...
  const set = await prisma.aiChangeSet.create({
    data: { coachId, clientId, request: request.slice(0, 2000), applied: applied as never, appliedById },
    select: { id: true },
  })
  return { changeSetId: set.id, applied: applied.length, skipped }
}
```

Replace the start of `undoChangeSet`:

```ts
/**
 * Put every row in a batch back the way it was. Allowed for the person who
 * applied it and for any coach of that client. Rows the client has logged on
 * since are left as they are.
 */
export async function undoChangeSet(userId: string, changeSetId: string) {
  const set = await prisma.aiChangeSet.findUnique({ where: { id: changeSetId } })
  if (!set) return { ok: false as const, error: "Not found" }
  if (set.appliedById !== userId && set.coachId !== userId) {
    const link = await prisma.clientCoach.findUnique({ where: { clientId_coachId: { clientId: set.clientId, coachId: userId } } })
    if (!link) return { ok: false as const, error: "Not found" }
  }
  if (set.undoneAt) return { ok: false as const, error: "Already undone" }
  // ... rest unchanged ...
```

- [ ] **Step 5: Switch the three routes to `aiAccess`**

`app/api/ai/assist/route.ts`: replace the `coachOf` import and the session block:

```ts
import { aiAccess, denialResponse, isDenied } from "@/lib/ai/access"
// ...
  const access = await aiAccess(body.clientId)
  if (isDenied(access)) return denialResponse(access)
  const coachId = access.coachId
```

Everything below that line already uses `coachId`, so funding, cap and settlement follow the paying coach unchanged.

`app/api/ai/assist/apply/route.ts`:

```ts
import { aiAccess, denialResponse, isDenied } from "@/lib/ai/access"
// ...
  const access = await aiAccess(body.clientId)
  if (isDenied(access)) return denialResponse(access)
  const result = await applyChanges(access.coachId, body.clientId, body.request ?? "", body.changes, access.userId)
  return NextResponse.json({ ...result, viewer: access.viewer })
```

`app/api/ai/assist/undo/route.ts`: drop the COACH role check, keep the session check:

```ts
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  // ...
  const r = await undoChangeSet(session.user.id, changeSetId)
```

Remove the now-unused `coachOf` imports from the two routes (it stays in `lib/coach-access.ts` for other callers).

- [ ] **Step 6: Run the AI test file**

Run: `PW_PORT=3012 npx playwright test tests/ai-assist.spec.ts --reporter=list`
Expected: all tests pass, including the two new ones and the unchanged "only a coach of that client" test (anonymous still 401).

- [ ] **Step 7: Commit**

```bash
git add lib/ai/access.ts lib/ai/apply.ts app/api/ai/assist tests/ai-assist.spec.ts
git commit -m "Ask AI: shared access check, applier recorded, undo for applier or coach"
```

---

### Task 3: Thread routes

**Files:**
- Create: `lib/ai/thread.ts`, `app/api/ai/assist/thread/route.ts`
- Test: `tests/ai-assist.spec.ts`

**Interfaces:**
- Produces: `GET /api/ai/assist/thread?clientId=` → `{ messages: ThreadMsg[] }`; `PUT` body `{ clientId, messages }` → `{ ok: true, saved: number }`; `DELETE ?clientId=` → `{ ok: true }`.
- Produces: `export type ThreadMsg` and `export function sanitizeMessages(input: unknown): ThreadMsg[]` in `lib/ai/thread.ts`.
- Consumes: `aiAccess` from Task 2.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ai-assist.spec.ts`:

```ts
test("threads: saved per person and client, trimmed, cleaned, and cleared", async ({ page, browser }) => {
  const msg = (i: number) => ({ role: i % 2 ? "assistant" : "user", text: `m${i}` })
  // Junk is refused.
  expect((await page.request.put("/api/ai/assist/thread", { data: { clientId, messages: "nope" } })).status()).toBe(400)
  // 30 messages in, last 20 kept; unknown fields and failed messages dropped; text trimmed to 4000.
  const long = Array.from({ length: 30 }, (_, i) => ({ ...msg(i), bogus: 1, text: i === 29 ? "x".repeat(5000) : `m${i}` }))
  long.push({ role: "assistant", text: "broken", failed: true } as never)
  const put = await page.request.put("/api/ai/assist/thread", { data: { clientId, messages: long } })
  expect(put.status(), await put.text()).toBe(200)
  const got = await (await page.request.get(`/api/ai/assist/thread?clientId=${clientId}`)).json()
  expect(got.messages.length).toBe(20)
  expect(got.messages[0].text).toBe("m10")
  expect(got.messages[19].text.length).toBe(4000)
  expect("bogus" in got.messages[0]).toBe(false)
  // The client's thread about the same training is separate.
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: true } })
  const { ctx, page: cp } = await clientContext(browser)
  const theirs = await (await cp.request.get(`/api/ai/assist/thread?clientId=${clientId}`)).json()
  expect(theirs.messages).toEqual([])
  await ctx.close()
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: false } })
  // Clear.
  expect((await page.request.delete(`/api/ai/assist/thread?clientId=${clientId}`)).status()).toBe(200)
  expect((await (await page.request.get(`/api/ai/assist/thread?clientId=${clientId}`)).json()).messages).toEqual([])
})
```

Add to `cleanup()`: `await prisma.aiThread.deleteMany({ where: { clientId } })`.

- [ ] **Step 2: Run to verify it fails**

Run: `PW_PORT=3012 npx playwright test tests/ai-assist.spec.ts -g "threads:" --reporter=list`
Expected: FAIL with 404 on the PUT (route does not exist).

- [ ] **Step 3: Write the sanitizer**

`lib/ai/thread.ts`:

```ts
import { noLongDashes } from "@/lib/text"

/**
 * The saved shape of an Ask AI conversation. It is the panel's Msg, minus
 * `failed` (transient) and anything we do not recognise. Bounds keep a row
 * small: 20 messages, 4000 chars of text, 60 changes of 300-char fields.
 */
export const THREAD_MAX_MESSAGES = 20
const MAX_TEXT = 4000
const MAX_CHANGES = 60

export type ThreadChange = {
  action: "replace" | "modify" | "remove" | "add"
  workoutId: string
  workoutName: string
  date: string
  exerciseId?: string
  exercise?: string
  currentPrescription?: string
  newExercise?: string
  newPrescription?: string
  libraryId?: string | null
  inLibrary?: boolean
  reason: string
}
export type ThreadMsg = {
  role: "user" | "assistant"
  text: string
  changes?: ThreadChange[]
  warnings?: string[]
  dropped?: string[]
  picked?: boolean[]
  state?: "pending" | "applied" | "discarded"
  changeSetId?: string | null
  undone?: boolean
  applyNote?: string
}

const str = (v: unknown, max: number) => (typeof v === "string" ? noLongDashes(v).slice(0, max) : undefined)
const strs = (v: unknown, max: number) => (Array.isArray(v) ? (v.map((x) => str(x, max)).filter((x): x is string => !!x)) : undefined)
const ACTIONS = new Set(["replace", "modify", "remove", "add"])

function change(v: unknown): ThreadChange | null {
  if (!v || typeof v !== "object") return null
  const c = v as Record<string, unknown>
  if (!ACTIONS.has(String(c.action)) || typeof c.workoutId !== "string" || typeof c.date !== "string") return null
  return {
    action: c.action as ThreadChange["action"],
    workoutId: c.workoutId.slice(0, 64),
    workoutName: str(c.workoutName, 200) ?? "",
    date: c.date.slice(0, 10),
    exerciseId: str(c.exerciseId, 64),
    exercise: str(c.exercise, 200),
    currentPrescription: str(c.currentPrescription, 300),
    newExercise: str(c.newExercise, 200),
    newPrescription: str(c.newPrescription, 300),
    libraryId: typeof c.libraryId === "string" ? c.libraryId.slice(0, 64) : c.libraryId === null ? null : undefined,
    inLibrary: typeof c.inLibrary === "boolean" ? c.inLibrary : undefined,
    reason: str(c.reason, 300) ?? "",
  }
}

/** Keep only what we store, bounded, newest 20. Throws on a non-array so the route can say 400. */
export function sanitizeMessages(input: unknown): ThreadMsg[] {
  if (!Array.isArray(input)) throw new Error("messages must be an array")
  const out: ThreadMsg[] = []
  for (const v of input) {
    if (!v || typeof v !== "object") continue
    const m = v as Record<string, unknown>
    if (m.failed) continue
    if (m.role !== "user" && m.role !== "assistant") continue
    const text = str(m.text, MAX_TEXT)
    if (text === undefined) continue
    const changes = Array.isArray(m.changes) ? m.changes.slice(0, MAX_CHANGES).map(change).filter((c): c is ThreadChange => !!c) : undefined
    const msg: ThreadMsg = { role: m.role, text }
    if (changes?.length) {
      msg.changes = changes
      msg.picked = Array.isArray(m.picked) ? changes.map((_, i) => m.picked![i] === true) : changes.map(() => true)
      msg.state = m.state === "applied" || m.state === "discarded" ? m.state : "pending"
      if (typeof m.changeSetId === "string") msg.changeSetId = m.changeSetId.slice(0, 64)
      if (m.undone === true) msg.undone = true
      const note = str(m.applyNote, 300)
      if (note) msg.applyNote = note
    }
    const warnings = strs(m.warnings, 400)
    if (warnings?.length) msg.warnings = warnings
    const dropped = strs(m.dropped, 400)
    if (dropped?.length) msg.dropped = dropped
    out.push(msg)
  }
  return out.slice(-THREAD_MAX_MESSAGES)
}
```

- [ ] **Step 4: Write the route**

`app/api/ai/assist/thread/route.ts`:

```ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAlert } from "@/lib/alert"
import { aiAccess, denialResponse, isDenied } from "@/lib/ai/access"
import { sanitizeMessages } from "@/lib/ai/thread"

/**
 * The saved Ask AI conversation for this person about this client.
 *   GET    ?clientId=            -> { messages }
 *   PUT    { clientId, messages } -> { ok, saved }
 *   DELETE ?clientId=            -> { ok }
 */
const clientIdFrom = (req: Request) => new URL(req.url).searchParams.get("clientId") ?? ""

async function handleGET(req: Request) {
  const clientId = clientIdFrom(req)
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 })
  const access = await aiAccess(clientId)
  if (isDenied(access)) return denialResponse(access)
  const row = await prisma.aiThread.findUnique({ where: { userId_clientId: { userId: access.userId, clientId } }, select: { messages: true } })
  return NextResponse.json({ messages: row?.messages ?? [] })
}

async function handlePUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; messages?: unknown }
  if (!body.clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 })
  const access = await aiAccess(body.clientId)
  if (isDenied(access)) return denialResponse(access)
  let messages
  try {
    messages = sanitizeMessages(body.messages)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
  await prisma.aiThread.upsert({
    where: { userId_clientId: { userId: access.userId, clientId: body.clientId } },
    update: { messages: messages as never },
    create: { userId: access.userId, clientId: body.clientId, messages: messages as never },
  })
  return NextResponse.json({ ok: true, saved: messages.length })
}

async function handleDELETE(req: Request) {
  const clientId = clientIdFrom(req)
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 })
  const access = await aiAccess(clientId)
  if (isDenied(access)) return denialResponse(access)
  await prisma.aiThread.deleteMany({ where: { userId: access.userId, clientId } })
  return NextResponse.json({ ok: true })
}

export const GET = withAlert("ai/assist/thread", handleGET)
export const PUT = withAlert("ai/assist/thread", handlePUT)
export const DELETE = withAlert("ai/assist/thread", handleDELETE)
```

- [ ] **Step 5: Run the test**

Run: `PW_PORT=3012 npx playwright test tests/ai-assist.spec.ts -g "threads:" --reporter=list`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/thread.ts app/api/ai/assist/thread/route.ts tests/ai-assist.spec.ts
git commit -m "Ask AI: saved thread per person and client"
```

---

### Task 4: Panel loads, saves and clears its thread

**Files:**
- Modify: `components/coach/AiAssistant.tsx`
- Test: `tests/ai-assist.spec.ts`

**Interfaces:**
- Consumes: thread routes from Task 3; `Msg` stays the panel's type (it is a superset of `ThreadMsg` by `failed`).
- Produces: the panel's `Msg` type is exported (`export type Msg`) for Task 6's copy variants; no new props yet.

- [ ] **Step 1: Write the failing browser test**

Append to `tests/ai-assist.spec.ts` (uses the same mocked reply pattern as "in the panel: review a proposal"):

```ts
async function mockReply(page: Page, w: Awaited<ReturnType<typeof seedSession>>) {
  const [squat] = w.exercises
  await page.route("**/api/ai/assist", async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    await route.fulfill({
      json: {
        reply: "Eased the squat.",
        changes: [{ action: "replace", workoutId: w.id, workoutName: w.name, date: dayKey(w.scheduledDate), exerciseId: squat.id, exercise: "Back Squat", newExercise: "Goblet Squat", newPrescription: "3x10", libraryId: null, inLibrary: false, reason: "Easier on the knee" }],
        warnings: [], dropped: [], meter: { spent: 0.05, cap: 25, level: "ok" },
      },
    })
  })
}

test("in the panel: a proposal survives a reload, still applies, and Clear wipes it", async ({ page }) => {
  const w = await seedSession(`${PREFIX}Reload Me`)
  await mockReply(page, w)
  await openPanel(page)
  await page.getByPlaceholder("Ask a question or describe a change").fill("Knee hurts")
  const saved = page.waitForResponse((r) => r.url().includes("/api/ai/assist/thread") && r.request().method() === "PUT")
  await page.getByRole("button", { name: "Send" }).click()
  await expect(page.getByText("Eased the squat.")).toBeVisible()
  expect((await saved).status()).toBe(200)

  await page.reload()
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: /Ask AI about/ }).click()
  await expect(page.getByText("Knee hurts")).toBeVisible()
  await expect(page.getByText("Eased the squat.")).toBeVisible()
  await page.getByRole("button", { name: "Apply 1 change" }).click()
  await expect(page.getByText(/Applied 1 change to/)).toBeVisible()
  await expect.poll(async () => (await prisma.workoutExercise.findUniqueOrThrow({ where: { id: w.exercises[0].id } })).name).toBe("Goblet Squat")

  // Applied state is saved too.
  await page.reload()
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: /Ask AI about/ }).click()
  await expect(page.getByText(/Applied 1 change to/)).toBeVisible()

  page.once("dialog", (d) => d.accept())
  await page.getByRole("button", { name: "Clear" }).click()
  await expect(page.getByText("Eased the squat.")).toBeHidden()
  await expect(page.getByText(/Ask a question, or tell me what to change/)).toBeVisible()
  expect(await prisma.aiThread.count({ where: { clientId } })).toBe(0)
})

test("in the panel: a restored proposal whose session is now done is skipped, not crashed on", async ({ page }) => {
  const w = await seedSession(`${PREFIX}Gone Stale`)
  await mockReply(page, w)
  await openPanel(page)
  await page.getByPlaceholder("Ask a question or describe a change").fill("Knee hurts")
  await page.getByRole("button", { name: "Send" }).click()
  await expect(page.getByText("Eased the squat.")).toBeVisible()
  await prisma.workout.update({ where: { id: w.id }, data: { isCompleted: true } })
  await page.reload()
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: /Ask AI about/ }).click()
  await page.getByRole("button", { name: "Apply 1 change" }).click()
  await expect(page.getByText(/not found, is already done, or is in the past/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Apply 1 change" })).toBeVisible() // back to pending
  await expect(page.getByText("Something went wrong")).toBeHidden()
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `PW_PORT=3012 npx playwright test tests/ai-assist.spec.ts -g "survives a reload|Gone Stale|now done" --reporter=list`
Expected: FAIL: after reload "Knee hurts" is not visible (first), Apply button missing after reload (second).

- [ ] **Step 3: Add thread load, save and clear to the panel**

In `components/coach/AiAssistant.tsx`:

Export the type: `export type Msg = { ... }` (same fields).

Add state and effects after `const first = ...`:

```ts
  const [loaded, setLoaded] = useState(false)
  // The conversation lives in the database so a reload or a crash does not lose it.
  useEffect(() => {
    if (!open || loaded) return
    let cancelled = false
    fetch(`/api/ai/assist/thread?clientId=${encodeURIComponent(clientId)}`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => {
        if (!cancelled && Array.isArray(d.messages)) setMsgs(d.messages)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, loaded, clientId])

  const saveThread = (messages: Msg[]) => {
    fetch("/api/ai/assist/thread", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, messages: messages.filter((m) => !m.failed) }),
    })
      .then((r) => {
        if (!r.ok) toast.error("Couldn't save this conversation")
      })
      .catch(() => toast.error("Couldn't save this conversation"))
  }

  const clearThread = async () => {
    const pending = msgs.some((m) => m.state === "pending")
    if (pending && !window.confirm("Clear this conversation? Unapplied edits will be dropped.")) return
    if (!pending && !window.confirm("Clear this conversation?")) return
    setMsgs([])
    await fetch(`/api/ai/assist/thread?clientId=${encodeURIComponent(clientId)}`, { method: "DELETE" }).catch(() => {})
  }
```

Make `patch` and the two `setMsgs` calls that add messages save afterwards. The simplest reliable way: a ref that mirrors state, saved from one effect.

```ts
  const lastSaved = useRef<Msg[] | null>(null)
  useEffect(() => {
    // Save on every change after the first load; skip the initial restore itself.
    if (!loaded) return
    if (lastSaved.current === msgs) return
    lastSaved.current = msgs
    if (msgs.length === 0) return
    saveThread(msgs)
  }, [msgs, loaded]) // eslint-disable-line react-hooks/exhaustive-deps
```

Set `lastSaved.current = d.messages` inside the load `.then` before `setMsgs(d.messages)`, so the restore does not write itself back.

Header: add the Clear link next to Close:

```tsx
                <div className="flex items-center gap-1">
                  {msgs.length > 0 && (
                    <button onClick={clearThread} className="rounded-full px-3 py-1 text-sm font-semibold text-[#6b6257]" aria-label="Clear">
                      Clear
                    </button>
                  )}
                  <button onClick={() => setOpen(false)} className="rounded-full px-3 py-1 text-sm font-semibold text-[#6b6257]" aria-label="Close">
                    Close
                  </button>
                </div>
```

Empty state: show examples only once loaded: change `{!msgs.length && (` to `{loaded && !msgs.length && (` and add before it `{!loaded && <p className="text-sm text-[#6b6257]">Loading…</p>}`.

In `runApply`, the "not found" skipped message already surfaces through `toast.error(d.skipped?.[0] ...)`; the test looks for that text, and sonner renders it in the DOM, so no change is needed there.

- [ ] **Step 4: Run the whole AI file**

Run: `PW_PORT=3012 npx playwright test tests/ai-assist.spec.ts --reporter=list`
Expected: all pass. If the existing "review a proposal" test now sees a stale thread from a previous test, add `await prisma.aiThread.deleteMany({ where: { clientId } })` to `test.beforeEach`.

- [ ] **Step 5: Commit**

```bash
git add components/coach/AiAssistant.tsx tests/ai-assist.spec.ts
git commit -m "Ask AI panel: conversation restored on open, saved on every turn, Clear"
```

---

### Task 5: The "Client can ask AI" switch

**Files:**
- Modify: `components/coach/ClientActions.tsx`, `app/api/clients/[clientId]/settings/route.ts`, `app/coach/clients/[clientId]/page.tsx:219`
- Test: `tests/ai-assist.spec.ts`

**Interfaces:**
- Produces: `ClientActions` props gain `canAskAi: boolean` and `assistantPlan: boolean`; settings PATCH accepts `canAskAi?: boolean`.
- Consumes: `getCoachPlan(coachId).plan.assistant` from `lib/plans.ts`.

- [ ] **Step 1: Write the failing test**

Append to `tests/ai-assist.spec.ts`:

```ts
test("the coach switches Ask AI on and off per client", async ({ page }) => {
  const res = await page.request.patch(`/api/clients/${clientId}/settings`, { data: { canAskAi: true } })
  expect(res.status()).toBe(200)
  expect((await prisma.clientProfile.findUniqueOrThrow({ where: { userId: clientId } })).canAskAi).toBe(true)
  // The switch is on the client page for coaches whose plan has the assistant. The test coach has no plan, so a note shows instead.
  await page.goto(`/coach/clients/${clientId}`)
  await expect(page.getByText(/Ask AI for clients comes with Pro/)).toBeVisible()
  await page.request.patch(`/api/clients/${clientId}/settings`, { data: { canAskAi: false } })
  expect((await prisma.clientProfile.findUniqueOrThrow({ where: { userId: clientId } })).canAskAi).toBe(false)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `PW_PORT=3012 npx playwright test tests/ai-assist.spec.ts -g "switches Ask AI" --reporter=list`
Expected: FAIL: `canAskAi` stays false (route ignores the field).

- [ ] **Step 3: Accept the field in the settings route**

In `app/api/clients/[clientId]/settings/route.ts`, extend the body type and `data`:

```ts
  const body = (await req.json()) as { canMoveWorkouts?: boolean; canAskAi?: boolean; units?: string; fastingEnabled?: boolean; fastingProtocol?: string }
  // ...
  const data = {
    ...(typeof body.canMoveWorkouts === "boolean" ? { canMoveWorkouts: body.canMoveWorkouts } : {}),
    ...(typeof body.canAskAi === "boolean" ? { canAskAi: body.canAskAi } : {}),
```

- [ ] **Step 4: Add the switch to `ClientActions`**

Props: `{ clientId, canMoveWorkouts, canAskAi, assistantPlan, hasPassword }: { clientId: string; canMoveWorkouts: boolean; canAskAi: boolean; assistantPlan: boolean; hasPassword: boolean }`.

State and toggle, after `toggleMove`:

```ts
  const [askAi, setAskAi] = useState(canAskAi)
  const toggleAskAi = async () => {
    const next = !askAi
    setAskAi(next)
    const res = await fetch(`/api/clients/${clientId}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canAskAi: next }),
    })
    if (!res.ok) {
      setAskAi(!next)
      toast.error("Couldn't save setting")
    }
  }
```

Markup, after the "Client can move workouts" label:

```tsx
        {assistantPlan ? (
          <label className="flex items-center gap-2 text-sm text-gray-700" title="Spends from your AI allowance">
            <input type="checkbox" checked={askAi} onChange={toggleAskAi} className="h-4 w-4 rounded border-gray-300" />
            Client can ask AI
            <span className="text-xs text-gray-500">(spends your allowance)</span>
          </label>
        ) : (
          <span className="text-xs text-gray-500">Ask AI for clients comes with Pro and Studio</span>
        )}
```

- [ ] **Step 5: Pass the props from the coach page**

In `app/coach/clients/[clientId]/page.tsx`, import `getCoachPlan` from `@/lib/plans`, add `getCoachPlan(session.user.id)` to the `Promise.all` at line ~74 as `coachPlan`, and change line ~219:

```tsx
            <ClientActions
              clientId={client.id}
              canMoveWorkouts={profile?.canMoveWorkouts ?? true}
              canAskAi={profile?.canAskAi ?? false}
              assistantPlan={coachPlan.plan.assistant}
              hasPassword={!!client.hashedPassword}
            />
```

Also extend the summary line at ~198 so the header lists "can ask AI" when on:

```tsx
                {[client.email, profile?.units === "kg" ? "kg" : "lb", profile?.canMoveWorkouts === false ? "can't move workouts" : "can move workouts", ...(profile?.canAskAi ? ["can ask AI"] : [])]
```

- [ ] **Step 6: Run the test and typecheck**

Run: `PW_PORT=3012 npx playwright test tests/ai-assist.spec.ts -g "switches Ask AI" --reporter=list && npx tsc --noEmit`
Expected: PASS; no tsc output.

- [ ] **Step 7: Commit**

```bash
git add components/coach/ClientActions.tsx app/api/clients/\[clientId\]/settings/route.ts app/coach/clients/\[clientId\]/page.tsx tests/ai-assist.spec.ts
git commit -m "Coach can switch Ask AI on per client"
```

---

### Task 6: The client's panel

**Files:**
- Modify: `components/coach/AiAssistant.tsx` (viewer prop and copy), `app/client/page.tsx`
- Create: `tests/ai-client.spec.ts`

**Interfaces:**
- Produces: `AiAssistant` props `{ clientId, clientName, meter, viewer?: "coach" | "client" }`, default `"coach"`.
- Consumes: Tasks 2 to 5.

- [ ] **Step 1: Write the failing client tests**

`tests/ai-client.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"
import { dayKey } from "../lib/training-format"

/** Ask AI on the client's own Today page: gated by the coach's switch, paid by the coach. */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })
let coachId = ""
let clientId = ""
const PREFIX = "AIC "

async function signInAsClient(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

async function seedSession(name: string) {
  const d = new Date(`${dayKey(new Date())}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return prisma.workout.create({
    data: {
      clientId, name, scheduledDate: d, dayOfWeek: d.getUTCDay(), order: 1, isCompleted: false,
      exercises: { create: [{ name: "Back Squat", prescription: "3x5 @ RPE 7, rest 2 min", order: 1 }] },
    },
    include: { exercises: true },
  })
}

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  coachId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-coach@dev.local" } })).id
  clientId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })).id
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { tourSeenAt: new Date() } })
})
test.beforeEach(async () => {
  await prisma.aiThread.deleteMany({ where: { clientId } })
  await prisma.aiChangeSet.deleteMany({ where: { clientId } })
  await prisma.aiUsage.deleteMany({ where: { coachId } })
  await prisma.workout.deleteMany({ where: { clientId, name: { startsWith: PREFIX } } })
})
test.afterAll(async () => {
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: false } })
  await prisma.workout.deleteMany({ where: { clientId, name: { startsWith: PREFIX } } })
  await prisma.$disconnect()
})

test("no switch, no button", async ({ page }) => {
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: false } })
  await signInAsClient(page)
  await expect(page.getByRole("button", { name: /Ask AI/ })).toBeHidden()
})

test("switched on: the client asks, reviews, applies, and the batch is theirs", async ({ page }) => {
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: true } })
  const w = await seedSession(`${PREFIX}Mine`)
  const [squat] = w.exercises
  await page.route("**/api/ai/assist", async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    await route.fulfill({
      json: {
        reply: "Eased your squat.",
        changes: [{ action: "modify", workoutId: w.id, workoutName: w.name, date: dayKey(w.scheduledDate), exerciseId: squat.id, exercise: "Back Squat", currentPrescription: "3x5 @ RPE 7, rest 2 min", newPrescription: "3x5 @ RPE 6, rest 2 min", reason: "Knee" }],
        warnings: ["Tell your coach if the knee keeps hurting"], // a warning stops auto-apply, so the client reviews
        dropped: [], meter: { spent: 0.05, cap: 25, level: "ok" },
      },
    })
  })
  await signInAsClient(page)
  await page.getByRole("button", { name: /Ask AI about your training/ }).click()
  const dialog = page.getByRole("dialog", { name: "AI assistant" })
  await expect(dialog.getByText("About your training. Nothing changes until you apply it.")).toBeVisible()
  await expect(dialog.getByText(/AI spend this month/)).toBeHidden()
  await expect(dialog.getByText("My shoulder is irritated. No overhead work for two weeks.")).toBeVisible()
  await page.getByPlaceholder("Ask a question or describe a change").fill("My knee hurts")
  await page.getByRole("button", { name: "Send" }).click()
  await expect(page.getByText("Eased your squat.")).toBeVisible()
  await page.getByRole("button", { name: "Apply 1 change" }).click()
  await expect(page.getByText(/Applied 1 change to your calendar/)).toBeVisible()
  const set = await prisma.aiChangeSet.findFirstOrThrow({ where: { clientId }, orderBy: { createdAt: "desc" } })
  expect(set.appliedById).toBe(clientId)
  expect(set.coachId).toBe(coachId)
})

test("switched off while the panel is open: the next ask explains instead of going blank", async ({ page }) => {
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: true } })
  await signInAsClient(page)
  await page.getByRole("button", { name: /Ask AI about your training/ }).click()
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: false } })
  await page.getByPlaceholder("Ask a question or describe a change").fill("Anything")
  await page.getByRole("button", { name: "Send" }).click()
  await expect(page.getByText(/hasn't switched on Ask AI for you/)).toBeVisible()
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `PW_PORT=3012 npx playwright test tests/ai-client.spec.ts --reporter=list`
Expected: first passes (button absent anyway), the other two FAIL: no "Ask AI about your training" button.

- [ ] **Step 3: Add the `viewer` prop and copy to the panel**

In `components/coach/AiAssistant.tsx`:

```ts
const EXAMPLES_COACH = [
  "Her shoulder is irritated. No overhead work for the next two weeks.",
  "He's travelling next week with only dumbbells and a bench.",
  "Squats have felt easy. Bump the next three weeks.",
]
const EXAMPLES_CLIENT = [
  "My shoulder is irritated. No overhead work for two weeks.",
  "I'm travelling next week with only dumbbells and a bench.",
  "Squats have felt easy. Bump the next three weeks.",
]

export default function AiAssistant({ clientId, clientName, meter: initial, viewer = "coach" }: { clientId: string; clientName: string; meter: Meter; viewer?: "coach" | "client" }) {
  const isClient = viewer === "client"
  const first = clientName.split(" ")[0] || "this client"
  const whose = isClient ? "your" : `${first}'s`           // "Applied 2 changes to your calendar."
  const about = isClient ? "your training" : first        // button label, subtitle
  const examples = isClient ? EXAMPLES_CLIENT : EXAMPLES_COACH
```

Then replace copy:
- Button `aria-label={`Ask AI about ${about}`}`.
- Subtitle: `About {about}. Nothing changes until you apply it.`
- Empty state: isClient ? `Ask a question, or tell me what to change in your upcoming training. I can see your sessions, results and notes.` : existing text.
- `EXAMPLES.map` → `examples.map`.
- Both apply notes: `` `Applied ${n} ... to ${whose} calendar.` `` (and the automatic variant).
- Spend meter block: wrap in `{!isClient && ( ... )}`.
- Capped placeholder: `meter.level === "capped" ? (isClient ? "Your coach's AI limit is used up for this month" : "Monthly AI limit reached") : "Ask a question or describe a change"`.

In `send`, the error path already shows `d.error` as a failed assistant message, which carries the 403 text from Task 2. No change needed.

- [ ] **Step 4: Render the panel on the client page**

In `app/client/page.tsx`: import `AiAssistant from "@/components/coach/AiAssistant"` and `spendMeter from "@/lib/ai/spend"`. After `const canMove = ...`:

```ts
  // Ask AI on the client's own training, when their coach switched it on. The meter is the coach's; the panel hides it for clients.
  const aiMeter = profile?.canAskAi && coachLink ? await spendMeter(coachLink.coachId) : null
```

In the returned JSX, after `<Tour ... />`:

```tsx
      {aiMeter && <AiAssistant clientId={session.user.id} clientName={session.user.name ?? ""} meter={aiMeter} viewer="client" />}
```

The client layout has `pb-28` on `<main>`, and the panel's button is `fixed bottom-5 right-5 z-30`, which sits inside that padding. Check visually once that it does not cover Today's bottom controls; if it does, change the client-mode button class to `bottom-24`.

- [ ] **Step 5: Run both AI test files and typecheck**

Run: `PW_PORT=3012 npx playwright test tests/ai-client.spec.ts tests/ai-assist.spec.ts --reporter=list && npx tsc --noEmit`
Expected: all pass; no tsc output.

- [ ] **Step 6: Commit**

```bash
git add components/coach/AiAssistant.tsx app/client/page.tsx tests/ai-client.spec.ts
git commit -m "Clients can use Ask AI on their own training when their coach allows it"
```

---

### Task 7: Coach push and the "Recent AI changes" strip

**Files:**
- Modify: `app/api/ai/assist/apply/route.ts` (push after a client apply)
- Create: `components/coach/RecentAiChanges.tsx`
- Modify: `app/coach/clients/[clientId]/page.tsx` (query + render above the calendar)
- Test: `tests/ai-client.spec.ts`

**Interfaces:**
- Produces: `RecentAiChanges({ items })` with `items: { id: string; when: string; who: string; request: string; count: number; undone: boolean }[]`.
- Consumes: `notifyUser` from `lib/notify.ts`; `/api/ai/assist/undo` from Task 2.

- [ ] **Step 1: Write the failing test**

Append to `tests/ai-client.spec.ts`:

```ts
test("the coach sees what the client changed and can undo it; a stranger coach cannot", async ({ page, browser }) => {
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: true } })
  const w = await seedSession(`${PREFIX}Seen By Coach`)
  const [squat] = w.exercises
  await signInAsClient(page)
  const res = await page.request.post("/api/ai/assist/apply", {
    data: { clientId, request: "Make my squat lighter please", changes: [{ action: "modify", workoutId: w.id, exerciseId: squat.id, newPrescription: "3x5 @ RPE 6" }] },
  })
  expect(res.status()).toBe(200)
  const { changeSetId } = await res.json()

  const coach = await browser.newContext({ storageState: "./.auth/coach.json" })
  const cp = await coach.newPage()
  await cp.goto(`/coach/clients/${clientId}`)
  const strip = cp.getByTestId("recent-ai-changes")
  await expect(strip).toContainText("Recent AI changes")
  await expect(strip).toContainText("Playwright")        // the client's first name
  await expect(strip).toContainText("Make my squat lighter please")
  await expect(strip).toContainText("1 edit")
  await strip.getByRole("button", { name: "Undo" }).click()
  await expect(strip).toContainText("Undone")
  await expect.poll(async () => (await prisma.workoutExercise.findUniqueOrThrow({ where: { id: squat.id } })).prescription).toBe("3x5 @ RPE 7, rest 2 min")
  await coach.close()

  // Someone who is not this client's coach cannot undo their batch.
  const again = await page.request.post("/api/ai/assist/apply", {
    data: { clientId, request: "again", changes: [{ action: "modify", workoutId: w.id, exerciseId: squat.id, newPrescription: "3x5 @ RPE 6" }] },
  })
  const { changeSetId: id2 } = await again.json()
  const stranger = await prisma.user.upsert({
    where: { email: "playwright-stranger-coach@dev.local" },
    update: {},
    create: { email: "playwright-stranger-coach@dev.local", name: "Stranger", role: "COACH", hashedPassword: "x", coachProfile: { create: {} } },
  })
  const { undoChangeSet } = await import("../lib/ai/apply")
  const r = await undoChangeSet(stranger.id, id2)
  expect(r.ok).toBe(false)
  void changeSetId
})
```

Note: the last part calls the library directly with the preview database, the same way the other spec files test `lib/ai/*` functions.

- [ ] **Step 2: Run to verify it fails**

Run: `PW_PORT=3012 npx playwright test tests/ai-client.spec.ts -g "coach sees" --reporter=list`
Expected: FAIL: no element with test id `recent-ai-changes`.

- [ ] **Step 3: Push the coach after a client apply**

In `app/api/ai/assist/apply/route.ts`, after `applyChanges`:

```ts
import { notifyUser } from "@/lib/notify"
import { prisma } from "@/lib/prisma"
// ...
  if (access.viewer === "client" && result.applied > 0) {
    const client = await prisma.user.findUnique({ where: { id: body.clientId }, select: { name: true } })
    const first = client?.name?.split(" ")[0] ?? "A client"
    const n = result.applied
    await notifyUser(access.coachId, {
      title: `${first} changed their training with AI`,
      body: `${n} ${n === 1 ? "edit" : "edits"}: ${(body.request ?? "").slice(0, 80)}`,
      url: `/coach/clients/${body.clientId}`,
      tag: `ai-change-${result.changeSetId}`,
    })
  }
```

`notifyUser` never throws and is a no-op when the coach has no registered device.

- [ ] **Step 4: Build the strip**

`components/coach/RecentAiChanges.tsx`:

```tsx
'use client'

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

export type RecentAiChange = { id: string; when: string; who: string; request: string; count: number; undone: boolean }

/** The last few batches of AI edits on this client, with Undo. Client-applied ones are why the coach looks here. */
export default function RecentAiChanges({ items: initial }: { items: RecentAiChange[] }) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  if (!items.length) return null

  const undo = async (id: string) => {
    const res = await fetch("/api/ai/assist/undo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changeSetId: id }) })
    if (!res.ok) return toast.error("Couldn't undo that")
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, undone: true } : x)))
    router.refresh()
  }

  return (
    <section data-testid="recent-ai-changes" className="rounded-2xl border border-[#e0dad0] bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#857c70]">Recent AI changes</p>
      <ul className="mt-1 divide-y divide-[#f0ece4]">
        {items.map((x) => (
          <li key={x.id} className="flex items-start justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="text-[#16181d]">
                <span className="font-semibold">{x.who}</span> <span className="text-[#6b6257]">{x.when}</span> <span className="text-[#6b6257]">&middot; {x.count} {x.count === 1 ? "edit" : "edits"}</span>
              </p>
              <p className="truncate text-xs text-[#6b6257]">{x.request}</p>
            </div>
            {x.undone ? (
              <span className="shrink-0 text-xs text-[#857c70]">Undone</span>
            ) : (
              <button onClick={() => undo(x.id)} className="shrink-0 rounded-lg border border-[#e0dad0] px-3 py-1 text-xs font-semibold text-[#16181d]">
                Undo
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 5: Query and render on the coach page**

In `app/coach/clients/[clientId]/page.tsx`: import `RecentAiChanges, { type RecentAiChange }`. Add to the `Promise.all` at line ~74:

```ts
    prisma.aiChangeSet.findMany({ where: { clientId: params.clientId }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, request: true, applied: true, createdAt: true, undoneAt: true, appliedById: true } }),
```

bound as `aiSets`. Then:

```ts
  const clientFirst = client.name?.split(" ")[0] ?? "Client"
  const recentAi: RecentAiChange[] = aiSets.map((s) => ({
    id: s.id,
    when: fmt(s.createdAt, { month: "short", day: "numeric" }),
    who: s.appliedById && s.appliedById !== session.user.id ? clientFirst : "you",
    request: s.request,
    count: Array.isArray(s.applied) ? (s.applied as unknown[]).length : 0,
    undone: !!s.undoneAt,
  }))
```

Render `<RecentAiChanges items={recentAi} />` directly above the `<CoachCalendar ... />` at line ~328, inside the same calendar tab block, with `mb-3` spacing via a wrapping `<div className="mb-3">`.

- [ ] **Step 6: Run both AI test files and typecheck**

Run: `PW_PORT=3012 npx playwright test tests/ai-client.spec.ts tests/ai-assist.spec.ts --reporter=list && npx tsc --noEmit`
Expected: all pass; no tsc output.

- [ ] **Step 7: Commit**

```bash
git add app/api/ai/assist/apply/route.ts components/coach/RecentAiChanges.tsx app/coach/clients/\[clientId\]/page.tsx tests/ai-client.spec.ts
git commit -m "Coach is pushed and sees Recent AI changes with Undo when a client edits with AI"
```

---

### Task 8: Full suite, production migration, merge, deploy, verify

**Files:** none new.

- [ ] **Step 1: Run the whole Playwright suite**

Run: `PW_PORT=3012 npx playwright test --reporter=list 2>&1 | tail -30`
Expected: everything passes. Fix anything the new columns or copy broke (for example a test matching the old header line) before going on.

- [ ] **Step 2: Production migration (Ryan runs it, prod writes are gated)**

Ask Ryan to run, from `~/wod-coach-ai`:

```
! npx tsx scripts/create-ai-thread.ts public
```

Expected output line names `AiThread.*`, `ClientProfile.canAskAi`, `AiChangeSet.appliedById`. Do not push before this.

- [ ] **Step 3: Merge to master and push**

```bash
git fetch origin
git checkout master && git merge --ff-only origin/master
git merge --no-ff feat/ai-threads-client-ask-ai -m "Merge feat/ai-threads-client-ask-ai: Ask AI threads are saved; clients can ask AI when allowed"
git push origin master
```

Then watch `gh api repos/rdobbeck/wod-coach-app/commits/$(git rev-parse master)/status` until the Vercel status is `success`.

- [ ] **Step 4: Verify in production**

In Chrome as the coach: open Ryan's own client page, open Ask AI, confirm the earlier thread is empty (new table), send one small request, reload, confirm it is restored, Discard, Clear. Switch "Client can ask AI" on for the Test Install client and confirm the header line says "can ask AI". Switch it back off. Report what was seen.
