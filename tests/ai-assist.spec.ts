import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { dbUrl } from "../lib/db-url"
import { dayKey } from "../lib/training-format"
import { assertUnderCap, spendMeter, AiCapError, monthStart } from "../lib/ai/spend"
import { parseProposal, isLoadBump, splitContext, renderContext, mergeProposals, explainEmpty, NOTHING_DONE, extractJson, aiToday, type Change, type Context, type Proposal } from "../lib/ai/assist"
import { createThreadWriter } from "../lib/ai/thread-writer"
import { suggestNames } from "../lib/exercise-match"

/**
 * The AI box: the monthly spend cap, what the assistant is allowed to touch,
 * and applying and undoing its edits. No test calls the real model; the
 * browser test mocks the model's reply and everything after it is real.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })

let coachId = ""
let clientId = ""
let otherId = ""
const PREFIX = "AI "
const tomorrow = () => {
  const d = new Date(`${dayKey(new Date())}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d
}

async function seedSession(name: string, opts: { owner?: string; done?: boolean; when?: Date } = {}) {
  const d = opts.when ?? tomorrow()
  return prisma.workout.create({
    data: {
      clientId: opts.owner ?? clientId,
      name,
      scheduledDate: d,
      dayOfWeek: d.getUTCDay(),
      order: 1,
      isCompleted: opts.done ?? false,
      exercises: {
        create: [
          { name: "Back Squat", prescription: "3x5 @ RPE 7, rest 2 min", order: 1, notes: "Brace hard", sets: 3, reps: "5" },
          { name: "Strict Press", prescription: "3x8 @ RPE 7, rest 2 min", order: 2 },
          { name: "Inverted row", prescription: "3x10, rest 90 s", order: 3 },
        ],
      },
    },
    include: { exercises: { orderBy: { order: "asc" } } },
  })
}

async function cleanup() {
  await prisma.aiThread.deleteMany({ where: { clientId } })
  await prisma.aiChangeSet.deleteMany({ where: { clientId } })
  await prisma.aiUsage.deleteMany({ where: { coachId } })
  await prisma.workout.deleteMany({ where: { clientId: { in: [clientId, otherId].filter(Boolean) }, name: { startsWith: PREFIX } } })
}

test.beforeAll(async () => {
  coachId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-coach@dev.local" } })).id
  clientId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })).id
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { tourSeenAt: new Date() } })
  const other = await prisma.user.upsert({
    where: { email: "playwright-other@dev.local" },
    update: {},
    create: { email: "playwright-other@dev.local", name: "Other Client", role: "CLIENT", hashedPassword: await bcrypt.hash("x-not-used-1", 10), clientProfile: { create: {} } },
  })
  otherId = other.id
  await cleanup()
})
test.afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})
// Panel tests save the thread in the background; let those requests land before the next test's cleanup.
const inflight = new WeakMap<Page, Set<unknown>>()
test.beforeEach(async ({ page }) => {
  const pending = new Set<unknown>()
  page.on("request", (r) => pending.add(r))
  page.on("requestfinished", (r) => pending.delete(r))
  page.on("requestfailed", (r) => pending.delete(r))
  inflight.set(page, pending)
  await prisma.aiThread.deleteMany({ where: { clientId } })
  await prisma.aiChangeSet.deleteMany({ where: { clientId } })
  await prisma.aiUsage.deleteMany({ where: { coachId } })
})
test.afterEach(async ({ page }) => {
  const pending = inflight.get(page)
  if (pending) await expect.poll(() => pending.size, { timeout: 5_000 }).toBe(0).catch(() => {})
})

// ---------- the cap ----------

test("spend meter warns at 60% and stops at the cap, and resets each month", async () => {
  const add = (usd: number, at = new Date()) =>
    prisma.aiUsage.create({ data: { coachId, kind: "assist", model: "test", costUsd: usd, createdAt: at } })

  expect((await spendMeter(coachId)).level).toBe("ok")
  await add(14)
  expect((await spendMeter(coachId)).level).toBe("ok")
  await add(1.5) // 15.50 of 25 is past 60%
  expect((await spendMeter(coachId)).level).toBe("warn")
  await add(9.5) // exactly 25
  const m = await spendMeter(coachId)
  expect(m.level).toBe("capped")
  await expect(assertUnderCap(coachId)).rejects.toBeInstanceOf(AiCapError)

  // Last month's spending does not count against this month.
  await prisma.aiUsage.deleteMany({ where: { coachId } })
  const lastMonth = new Date(monthStart().getTime() - 86_400_000)
  await add(40, lastMonth)
  expect((await spendMeter(coachId)).spent).toBe(0)
  await expect(assertUnderCap(coachId)).resolves.toBeTruthy()
})

test("once the cap is reached the endpoint refuses before calling any model", async ({ page }) => {
  await prisma.aiUsage.create({ data: { coachId, kind: "assist", model: "test", costUsd: 26 } })
  const res = await page.request.post("/api/ai/assist", { data: { clientId, message: "Rebuild next week" } })
  expect(res.status()).toBe(402)
  const body = await res.json()
  expect(body.code).toBe("AI_CAP")
  expect(body.error).toMatch(/monthly AI limit/i)
  // Nothing was recorded, so nothing was spent on a model call.
  expect(await prisma.aiUsage.count({ where: { coachId } })).toBe(1)
})

test("only a coach of that client can use the assistant", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  const anon = await page.request.post("/api/ai/assist", { data: { clientId, message: "hi" } })
  expect(anon.status()).toBe(401)
  const anonApply = await page.request.post("/api/ai/assist/apply", { data: { clientId, changes: [{ action: "remove", workoutId: "x" }] } })
  expect(anonApply.status()).toBe(401)
  await ctx.close()
})

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
  // Switched on: the call reaches the coach's funding checks. Cap the coach first (and empty the balance) so the
  // route refuses with the coach's cap error before any model is called: 402 AI_CAP proves the gate opened.
  await prisma.aiUsage.create({ data: { coachId, kind: "assist", model: "test", costUsd: 26 } })
  await prisma.coachProfile.updateMany({ where: { userId: coachId }, data: { aiBalanceCents: 0 } })
  const on = await page.request.post("/api/ai/assist", { data: { clientId, message: "hi" } })
  expect(on.status()).toBe(402)
  const capped = await on.json()
  expect(capped.code).toBe("AI_CAP")
  expect(capped.error).toMatch(/your coach's AI allowance/i) // client-facing copy, not "add balance in Settings"
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

test("the coach switches Ask AI on and off per client", async ({ page }) => {
  const res = await page.request.patch(`/api/clients/${clientId}/settings`, { data: { canAskAi: true } })
  expect(res.status()).toBe(200)
  expect((await prisma.clientProfile.findUniqueOrThrow({ where: { userId: clientId } })).canAskAi).toBe(true)
  // The switch sits beside "Client can move workouts" (the test coach's trial plan includes the assistant).
  await page.goto(`/coach/clients/${clientId}`)
  const box = page.getByRole("checkbox", { name: /Client can ask AI/ })
  await expect(box).toBeChecked()
  await expect(page.getByText(/can ask AI/).first()).toBeVisible()
  await box.uncheck()
  await expect.poll(async () => (await prisma.clientProfile.findUniqueOrThrow({ where: { userId: clientId } })).canAskAi).toBe(false)
})

// ---------- reading the model's answer ----------

const ctx: Context = {
  today: "2026-09-30",
  profile: "Units: lb",
  recent: "",
  sessions: [
    {
      ref: "s1", id: "w1", date: "2026-10-01", name: "Day A",
      exercises: [
        { ref: "s1e1", id: "e1", name: "Back Squat", rx: "3x5", locked: false, hasVideo: true },
        { ref: "s1e2", id: "e2", name: "Strict Press", rx: "3x8", locked: true, hasVideo: true },
        { ref: "s1e3", id: "e3", name: "Inverted row", rx: "3x10", locked: false, hasVideo: false, suggestions: ["Inverted Row", "Ring Row"] },
      ],
    },
  ],
}
const LIB: Record<string, { name: string; video: boolean }> = {
  lib1: { name: "Goblet Squat", video: true },
  lib2: { name: "Inverted Row", video: true },
  lib3: { name: "Ring Row", video: false },
}
const match = (n: string) => Object.entries(LIB).find(([, v]) => v.name.toLowerCase() === n.toLowerCase())?.[0] ?? null
const libName = (id: string) => LIB[id]?.name ?? null
const hasVideo = (id: string) => !!LIB[id]?.video

test("link: the first name that matches a library entry with a video wins, and the row keeps its own name", () => {
  const answer = JSON.stringify({
    reply: "Linked the row's video.",
    changes: [
      { action: "link", ref: "s1e3", newExercise: "Bodyweight Row", candidates: ["Ring Row", "Inverted Row"], reason: "demo video" },
      { action: "link", ref: "s1e1", newExercise: "Nothing Like This", candidates: ["Ring Row"], reason: "no video anywhere" },
      { action: "link", ref: "s1e2", newExercise: "Goblet Squat", reason: "locked" },
      { action: "link", ref: "s1e3", reason: "no names at all" },
    ],
    warnings: [],
  })
  const p = parseProposal(answer, ctx, match, libName, hasVideo)
  expect(p.changes).toHaveLength(1)
  const link = p.changes[0]
  expect(link.action).toBe("link")
  expect(link.exerciseId).toBe("e3")
  expect(link.exercise).toBe("Inverted row")
  // "Bodyweight Row" matched nothing and "Ring Row" has no video, so "Inverted Row" is the one.
  expect(link.libraryId).toBe("lib2")
  expect(link.newExercise).toBe("Inverted Row")
  expect(link.inLibrary).toBe(true)
  expect(link.newPrescription).toBeUndefined()
  // Every name tried is reported when none of them had a video.
  expect(p.dropped.find((d) => d.includes("Back Squat"))).toMatch(/Nothing Like This.*Ring Row/)
  expect(p.dropped.join(" ")).toContain("already has logged sets")
  expect(p.dropped.length).toBe(3)
  // Linking a video is never a load bump, so it waits for a person.
  expect(p.autoApply).toBe(false)
})

test("the model's answer is checked before anyone sees it", () => {
  const answer = JSON.stringify({
    reply: "Swapped the squat and trimmed the rest.",
    changes: [
      { action: "replace", ref: "s1e1", newExercise: "Goblet Squat", newPrescription: "3x8 — light", reason: "Knee friendly" },
      { action: "replace", ref: "s9e1", newExercise: "Goblet Squat", newPrescription: "3x8", reason: "no such session" },
      { action: "remove", ref: "s1e2", reason: "locked, has logged sets" },
      { action: "modify", ref: "s1e1", newPrescription: "2x8", reason: "second change to the same row" },
      { action: "add", ref: "s1", newExercise: "Plank", reason: "no prescription given" },
      { action: "add", ref: "s1", newExercise: "Made Up Movement", newPrescription: "3x30 s", reason: "not in the library" },
      { action: "explode", ref: "s1e3" },
    ],
    warnings: ["Check the landmine attachment exists"],
  })
  const p = parseProposal(answer, ctx, match, libName)

  expect(p.changes.map((c) => `${c.action}:${c.exerciseId ?? c.workoutId}`)).toEqual(["replace:e1", "add:w1"])
  const replace = p.changes[0]
  expect(replace.newExercise).toBe("Goblet Squat")
  expect(replace.libraryId).toBe("lib1")
  expect(replace.inLibrary).toBe(true)
  // No em or en dashes ever reach the calendar.
  expect(replace.newPrescription).toBe("3x8, light")
  // An exercise that is not in the library is kept, but flagged as having no video.
  expect(p.changes[1].inLibrary).toBe(false)

  expect(p.dropped.join(" ")).toContain("s9e1")
  expect(p.dropped.join(" ")).toContain("already has logged sets")
  expect(p.dropped.join(" ")).toContain("changed twice")
  expect(p.dropped.length).toBe(5)
  expect(p.warnings).toEqual(["Check the landmine attachment exists"])
})

test("answers that are not clean JSON still come through", () => {
  const fenced = parseProposal('```json\n{"reply":"Nothing to change.","changes":[]}\n```', ctx, match, libName)
  expect(fenced.reply).toBe("Nothing to change.")
  const prose = parseProposal("Sure. Which weeks do you mean?", ctx, match, libName)
  expect(prose.reply).toBe("Sure. Which weeks do you mean?")
  expect(prose.changes).toEqual([])
  // A sentence before the JSON used to lose every change and show the raw JSON as the reply.
  const chatty = parseProposal(
    'Across the sessions, two rows need work. { "reply": "Swapped the squat.", "changes": [{ "action": "replace", "ref": "s1e1", "newExercise": "Goblet Squat", "newPrescription": "3x8 {light}", "reason": "knee" }], "warnings": [] } Hope that helps.',
    ctx, match, libName
  )
  expect(chatty.reply).toBe("Swapped the squat.")
  expect(chatty.changes.map((c) => c.newPrescription)).toEqual(["3x8 {light}"])
  expect(extractJson("no json here { not json }")).toBeNull()
})

test("today is the coach's day, not UTC's: 9pm in Chicago is still that day", () => {
  expect(aiToday(new Date("2026-10-22T02:00:00Z"))).toBe("2026-10-21")
  expect(aiToday(new Date("2026-10-22T15:00:00Z"))).toBe("2026-10-22")
})

test("move and delete a whole session; add can go first", () => {
  const two: Context = {
    ...ctx,
    sessions: [
      ctx.sessions[0],
      { ref: "s2", id: "w2", date: "2026-10-02", name: "Day B", exercises: [{ ref: "s2e1", id: "e9", name: "Deadlift", rx: "3x5", locked: false, hasVideo: true }] },
    ],
  }
  const p = parseProposal(
    JSON.stringify({
      reply: "Moved Day A and cancelled Day B.",
      changes: [
        { action: "delete", ref: "s1", reason: "has logs" },
        { action: "move", ref: "s1", date: "2026-10-03", reason: "travel" },
        { action: "move", ref: "s1", date: "2026-10-04", reason: "twice" },
        { action: "move", ref: "s2", date: "2026-09-01", reason: "past" },
        { action: "delete", ref: "s2", reason: "cancel" },
        { action: "add", ref: "s2", newExercise: "Goblet Squat", newPrescription: "2x5 breaths", position: "start", reason: "warm-up" },
      ],
      warnings: [],
    }),
    two, match, libName
  )
  expect(p.changes.map((c) => `${c.action}:${c.workoutId}:${c.newDate ?? c.position ?? ""}`)).toEqual(["move:w1:2026-10-03", "delete:w2:", "add:w2:start"])
  expect(p.dropped.join(" ")).toContain("moved or deleted twice")
  expect(p.dropped.join(" ")).toContain("no new date from today on")
  expect(p.dropped.join(" ")).toContain("not deleted")
  expect(p.autoApply).toBe(false)
  // The model is told about the new actions and that sessions with logs can't be deleted.
  expect(renderContext(two)).toContain("s1  Thu 2026-10-01  Day A  HAS LOGS")
})

test("only a load bump may apply itself: same movement, same sets and reps", () => {
  const c = (over: Partial<Change>): Change => ({
    action: "modify", workoutId: "w", workoutName: "A", date: "2026-10-01", exerciseId: "e",
    exercise: "Back Squat", currentPrescription: "3x8 @ RPE 6.5, rest 2 min", newPrescription: "3x8 @ RPE 7, rest 2 min", reason: "", ...over,
  })
  expect(isLoadBump(c({}))).toBe(true)
  expect(isLoadBump(c({ currentPrescription: "3x8-10 @ RPE 6", newPrescription: "3x8-10 @ RPE 7" }))).toBe(true)
  // Different sets or reps is a redesign, not a bump.
  expect(isLoadBump(c({ newPrescription: "5x3 @ RPE 8, rest 3 min" }))).toBe(false)
  expect(isLoadBump(c({ newPrescription: "4x8 @ RPE 7" }))).toBe(false)
  // No change, no starting point, and non-modify actions are never bumps.
  expect(isLoadBump(c({ newPrescription: "3x8 @ RPE 6.5, rest 2 min" }))).toBe(false)
  expect(isLoadBump(c({ currentPrescription: "AMRAP 10 min" }))).toBe(false)
  expect(isLoadBump(c({ action: "replace", newExercise: "Goblet Squat" }))).toBe(false)

  const bump = (ref: string, rx: string) => ({ action: "modify", ref, newPrescription: rx, reason: "" })
  const ask = (changes: unknown[], warnings: string[] = []) =>
    parseProposal(JSON.stringify({ reply: "ok", changes, warnings }), ctx, match, libName)
  expect(ask([bump("s1e1", "3x5 @ RPE 8")]).autoApply).toBe(true)
  // One redesign in the batch, and the whole batch waits.
  expect(ask([bump("s1e1", "3x5 @ RPE 8"), { action: "remove", ref: "s1e3", reason: "" }]).autoApply).toBe(false)
  // If the model flagged a concern, a person looks first.
  expect(ask([bump("s1e1", "3x5 @ RPE 8")], ["Check her knee"]).autoApply).toBe(false)
  expect(ask([]).autoApply).toBe(false)
})

// ---------- applying and undoing ----------

test("applying edits respects locked, done and other clients' sessions, and undo restores everything", async ({ page, browser }) => {
  const w = await seedSession(`${PREFIX}Apply Me`)
  const done = await seedSession(`${PREFIX}Already Done`, { done: true })
  const theirs = await seedSession(`${PREFIX}Not Theirs`, { owner: otherId })
  const [squat, press, row] = w.exercises

  // The client logs a set on the press, which locks it from AI edits.
  const cctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const cp = await cctx.newPage()
  await cp.goto("/auth/signin")
  await cp.locator('input[name="email"]').fill("playwright-client@dev.local")
  await cp.locator('input[name="password"]').fill("playwright-test-PW-1")
  await cp.locator('button[type="submit"]').click()
  await cp.waitForURL(/\/client$/, { timeout: 15_000 })
  const logged = await cp.request.put(`/api/workouts/${w.id}/log`, {
    data: { exercises: [{ workoutExerciseId: press.id, resultText: "", rpe: null, sets: [{ weight: 95, reps: 8, rpe: null, done: true }] }], complete: false },
  })
  expect(logged.ok()).toBe(true)
  await cctx.close()

  const res = await page.request.post("/api/ai/assist/apply", {
    data: {
      clientId,
      request: "test request",
      changes: [
        { action: "replace", workoutId: w.id, exerciseId: squat.id, newExercise: "Goblet Squat", newPrescription: "3x10, rest 90 s" },
        { action: "replace", workoutId: w.id, exerciseId: press.id, newExercise: "Push-Up", newPrescription: "3x10" }, // logged: refused
        { action: "remove", workoutId: w.id, exerciseId: row.id },
        { action: "add", workoutId: w.id, newExercise: "Face Pull", newPrescription: "3x15" },
        { action: "modify", workoutId: done.id, exerciseId: done.exercises[0].id, newPrescription: "1x1" }, // done: refused
        { action: "remove", workoutId: theirs.id, exerciseId: theirs.exercises[0].id }, // someone else's: refused
      ],
    },
  })
  expect(res.ok()).toBe(true)
  const out = await res.json()
  expect(out.applied).toBe(3)
  expect(out.skipped).toHaveLength(3)

  const after = await prisma.workoutExercise.findMany({ where: { workoutId: w.id }, orderBy: { order: "asc" } })
  expect(after.map((e) => e.name)).toEqual(["Goblet Squat", "Strict Press", "Face Pull"])
  expect(after[0].prescription).toBe("3x10, rest 90 s")
  // The old movement's cue and numbers went with it.
  expect(after[0].notes).toBeNull()
  expect(after[0].sets).toBeNull()
  // Untouched: the logged exercise, the done session, the other client's session.
  expect(after[1].prescription).toBe("3x8 @ RPE 7, rest 2 min")
  expect((await prisma.workoutExercise.findUniqueOrThrow({ where: { id: done.exercises[0].id } })).prescription).toBe("3x5 @ RPE 7, rest 2 min")
  expect(await prisma.workoutExercise.count({ where: { workoutId: theirs.id } })).toBe(3)

  // Undo puts the batch back exactly as it was.
  const undo = await page.request.post("/api/ai/assist/undo", { data: { changeSetId: out.changeSetId } })
  expect(undo.ok()).toBe(true)
  const back = await prisma.workoutExercise.findMany({ where: { workoutId: w.id }, orderBy: { order: "asc" } })
  expect(back.map((e) => e.name)).toEqual(["Back Squat", "Strict Press", "Inverted row"])
  expect(back[0].prescription).toBe("3x5 @ RPE 7, rest 2 min")
  expect(back[0].notes).toBe("Brace hard")
  expect(back[0].sets).toBe(3)
  expect(back[2].id).toBe(row.id) // the removed row is the same row again

  // And it cannot be undone twice.
  const again = await page.request.post("/api/ai/assist/undo", { data: { changeSetId: out.changeSetId } })
  expect(again.status()).toBe(404)
})

test("linking a video attaches the library entry, keeps the coach's wording, and undo detaches it", async ({ page }) => {
  const w = await seedSession(`${PREFIX}Link Me`)
  const [squat, , row] = w.exercises
  const withVideo = await prisma.exerciseLibrary.create({
    data: { name: `${PREFIX}Inverted Row Demo`, category: "Upper Pull", difficulty: "Beginner", videoUrl: "https://example.com/row.mp4", isCustom: true, createdBy: coachId },
  })
  const noVideo = await prisma.exerciseLibrary.create({
    data: { name: `${PREFIX}Silent Squat`, category: "Lower Push", difficulty: "Beginner", isCustom: true, createdBy: coachId },
  })
  try {
    const res = await page.request.post("/api/ai/assist/apply", {
      data: {
        clientId,
        request: "add videos",
        changes: [
          { action: "link", workoutId: w.id, exerciseId: row.id, newExercise: withVideo.name, libraryId: withVideo.id },
          { action: "link", workoutId: w.id, exerciseId: squat.id, newExercise: noVideo.name, libraryId: noVideo.id }, // no video: refused
          { action: "link", workoutId: w.id, exerciseId: squat.id, newExercise: "x", libraryId: "nope" }, // unknown entry: refused
        ],
      },
    })
    expect(res.ok()).toBe(true)
    const out = await res.json()
    expect(out.applied).toBe(1)
    expect(out.skipped).toHaveLength(2)

    const linked = await prisma.workoutExercise.findUniqueOrThrow({ where: { id: row.id } })
    expect(linked.exerciseId).toBe(withVideo.id)
    expect(linked.name).toBe("Inverted row")
    expect(linked.prescription).toBe("3x10, rest 90 s")
    expect((await prisma.workoutExercise.findUniqueOrThrow({ where: { id: squat.id } })).exerciseId).toBeNull()

    const undo = await page.request.post("/api/ai/assist/undo", { data: { changeSetId: out.changeSetId } })
    expect(undo.ok()).toBe(true)
    expect((await prisma.workoutExercise.findUniqueOrThrow({ where: { id: row.id } })).exerciseId).toBeNull()
  } finally {
    await prisma.exerciseLibrary.deleteMany({ where: { id: { in: [withVideo.id, noVideo.id] } } })
  }
})

test("library suggestions: closest video-backed names by shared words, nothing when nothing is close", () => {
  const rows = [
    { name: "90-90 Hip Lift", videoUrl: "v" },
    { name: "90-90 Hip Lift with Balloon", videoUrl: "v" },
    { name: "Hip Thrust", videoUrl: "v" },
    { name: "Supine Hip Lift", videoUrl: null }, // no video, never suggested
    { name: "Back Squat", videoUrl: "v" },
  ]
  expect(suggestNames("90/90 Hip Lift", rows)).toEqual(["90-90 Hip Lift", "90-90 Hip Lift with Balloon"])
  expect(suggestNames("Hip Lift", rows)).toEqual(["90-90 Hip Lift", "90-90 Hip Lift with Balloon"])
  expect(suggestNames("Left AIC Repositioning", rows)).toEqual([])
  expect(suggestNames("Hip Thrust", rows, 1)).toEqual(["Hip Thrust"])
})

// ---------- the panel ----------

async function openPanel(page: Page) {
  await page.goto(`/coach/clients/${clientId}`)
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: /Ask AI about/ }).click()
  await expect(page.getByRole("dialog", { name: "AI assistant" })).toBeVisible()
}

test("in the panel: review a proposal, untick a change, apply, undo", async ({ page }) => {
  const w = await seedSession(`${PREFIX}Panel Session`)
  const [squat, , row] = w.exercises
  await prisma.aiUsage.create({ data: { coachId, kind: "assist", model: "test", costUsd: 3.2 } })

  // Only the model's reply is faked. Applying and undoing are real.
  await page.route("**/api/ai/assist", async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    await route.fulfill({
      json: {
        reply: "Swapped the squat and dropped the row.",
        changes: [
          { action: "replace", workoutId: w.id, workoutName: w.name, date: dayKey(w.scheduledDate), exerciseId: squat.id, exercise: "Back Squat", newExercise: "Goblet Squat", newPrescription: "3x10", libraryId: null, inLibrary: false, reason: "Easier on the knee" },
          { action: "remove", workoutId: w.id, workoutName: w.name, date: dayKey(w.scheduledDate), exerciseId: row.id, exercise: "Inverted row", reason: "Cut for time" },
        ],
        warnings: ["Check the knee feels okay"],
        dropped: [],
        meter: { spent: 3.26, cap: 25, level: "ok" },
      },
    })
  })

  await openPanel(page)
  await expect(page.getByText("$3.20 of $25")).toBeVisible()
  await page.getByPlaceholder("Ask a question or describe a change").fill("His knee hurts, ease the squat")
  await page.getByRole("button", { name: "Send" }).click()

  await expect(page.getByText("Swapped the squat and dropped the row.")).toBeVisible()
  await expect(page.getByText("no demo video")).toBeVisible() // Goblet Squat is not in the test library
  await expect(page.getByText("Check the knee feels okay")).toBeVisible()
  await expect(page.getByText("$3.26 of $25")).toBeVisible()

  // Untick the removal, so only the swap goes through.
  await page.getByRole("dialog", { name: "AI assistant" }).locator("label", { hasText: "Inverted row" }).getByRole("checkbox").uncheck()
  await page.getByRole("button", { name: "Apply 1 change" }).click()
  await expect(page.getByText(/Applied 1 change to/)).toBeVisible()
  await expect.poll(async () => (await prisma.workoutExercise.findUniqueOrThrow({ where: { id: squat.id } })).name).toBe("Goblet Squat")
  expect(await prisma.workoutExercise.count({ where: { id: row.id } })).toBe(1) // the unticked one stayed

  const undone = page.waitForResponse((r) => r.url().includes("/api/ai/assist/undo"))
  await page.getByRole("button", { name: "Undo" }).click()
  const ur = await undone
  expect(ur.status(), await ur.text()).toBe(200)
  await expect(page.getByText(/Undone/)).toBeVisible()
  await expect.poll(async () => (await prisma.workoutExercise.findUniqueOrThrow({ where: { id: squat.id } })).name).toBe("Back Squat")
})

test("in the panel: the page survives a browser whose scrollIntoView returns a value", async ({ page }) => {
  // Chrome 154 made scrollIntoView return an object. The panel scrolls to the
  // newest message in an effect; if that effect hands the return value to
  // React as its cleanup, React calls it on the next message and the whole
  // client page falls over to the error screen, taking the proposal with it.
  await page.addInitScript(() => {
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element, ...args: unknown[]) {
      ;(original as (...a: unknown[]) => void).apply(this, args)
      return { done: true } as unknown as void
    }
  })
  const w = await seedSession(`${PREFIX}Scroll Session`)
  const [squat] = w.exercises
  await page.route("**/api/ai/assist", async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    await route.fulfill({
      json: {
        reply: "Swapped the squat.",
        changes: [
          { action: "replace", workoutId: w.id, workoutName: w.name, date: dayKey(w.scheduledDate), exerciseId: squat.id, exercise: "Back Squat", newExercise: "Goblet Squat", newPrescription: "3x10", libraryId: null, inLibrary: false, reason: "Easier on the knee" },
        ],
        warnings: [],
        dropped: [],
        meter: { spent: 0.05, cap: 25, level: "ok" },
      },
    })
  })

  await openPanel(page)
  await page.getByPlaceholder("Ask a question or describe a change").fill("His knee hurts, ease the squat")
  await page.getByRole("button", { name: "Send" }).click()

  await expect(page.getByText("Swapped the squat.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Apply 1 change" })).toBeVisible()
  await expect(page.getByText("Something went wrong")).toBeHidden()
})

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
  await expect(page.getByText("Knee hurts", { exact: true })).toBeVisible()
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
  const deleted = page.waitForResponse((r) => r.url().includes("/api/ai/assist/thread") && r.request().method() === "DELETE")
  await page.getByRole("button", { name: "Clear" }).click()
  await expect(page.getByText("Eased the squat.")).toBeHidden()
  await expect(page.getByText(/Ask a question, or tell me what to change/)).toBeVisible()
  expect((await deleted).status()).toBe(200)
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

const RESTATED = "Raise the effort by one RPE on every lift next week."

/** First POST gets a confirm card (kind as given); later POSTs get the normal proposal. Bodies are recorded. */
async function mockConfirm(page: Page, w: Awaited<ReturnType<typeof seedSession>>, kind: "restate" | "question" = "restate") {
  const bodies: Record<string, unknown>[] = []
  await page.route("**/api/ai/assist", async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    bodies.push(route.request().postDataJSON())
    const meter = { spent: 0.05, cap: 25, level: "ok" }
    if (bodies.length === 1) {
      const text = kind === "restate" ? RESTATED : "Which lifts do you want to make harder?"
      return route.fulfill({ json: { confirm: { kind, text }, check: { intent: "change_exercises", clear: 0.01 }, meter } })
    }
    const [squat] = w.exercises
    await route.fulfill({
      json: {
        reply: "Eased the squat.",
        changes: [{ action: "replace", workoutId: w.id, workoutName: w.name, date: dayKey(w.scheduledDate), exerciseId: squat.id, exercise: "Back Squat", newExercise: "Goblet Squat", newPrescription: "3x10", libraryId: null, inLibrary: false, reason: "Easier on the knee" }],
        warnings: [], dropped: [], meter,
      },
    })
  })
  return bodies
}

test("in the panel: a vague ask shows what it understood; Yes sends it confirmed", async ({ page }) => {
  const w = await seedSession(`${PREFIX}Confirm Yes`)
  const bodies = await mockConfirm(page, w)
  await openPanel(page)
  await page.getByPlaceholder("Ask a question or describe a change").fill("harder")
  await page.getByRole("button", { name: "Send" }).click()
  await expect(page.getByText(RESTATED)).toBeVisible()
  await expect(page.getByRole("button", { name: "Yes, do it" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Not quite" })).toBeVisible()

  await page.getByRole("button", { name: "Yes, do it" }).click()
  await expect(page.getByText("Eased the squat.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Yes, do it" })).toBeHidden()
  expect(bodies).toHaveLength(2)
  expect(bodies[0].confirmed).toBeUndefined()
  expect(bodies[1].confirmed).toBe(true)
  expect(bodies[1].message).toBe(RESTATED)
})

test("in the panel: Not quite puts the restatement in the box to edit", async ({ page }) => {
  const w = await seedSession(`${PREFIX}Confirm Edit`)
  const bodies = await mockConfirm(page, w)
  await openPanel(page)
  await page.getByPlaceholder("Ask a question or describe a change").fill("harder")
  await page.getByRole("button", { name: "Send" }).click()
  await page.getByRole("button", { name: "Not quite" }).click()
  await expect(page.getByPlaceholder("Ask a question or describe a change")).toHaveValue(RESTATED)
  await expect(page.getByRole("button", { name: "Yes, do it" })).toBeHidden()
  expect(bodies).toHaveLength(1)
})

test("in the panel: a restate question shows with no buttons", async ({ page }) => {
  const w = await seedSession(`${PREFIX}Confirm Question`)
  await mockConfirm(page, w, "question")
  await openPanel(page)
  await page.getByPlaceholder("Ask a question or describe a change").fill("harder")
  await page.getByRole("button", { name: "Send" }).click()
  await expect(page.getByText("Which lifts do you want to make harder?")).toBeVisible()
  await expect(page.getByRole("button", { name: "Yes, do it" })).toBeHidden()
  await expect(page.getByRole("button", { name: "Not quite" })).toBeHidden()
})

test("in the panel: the card and the intent survive a reload", async ({ page }) => {
  const w = await seedSession(`${PREFIX}Confirm Reload`)
  await mockConfirm(page, w)
  await openPanel(page)
  await page.getByPlaceholder("Ask a question or describe a change").fill("harder")
  const saved = page.waitForResponse((r) => r.url().includes("/api/ai/assist/thread") && r.request().method() === "PUT" && (r.request().postData() ?? "").includes("change_exercises"))
  await page.getByRole("button", { name: "Send" }).click()
  await expect(page.getByRole("button", { name: "Yes, do it" })).toBeVisible()
  expect((await saved).status()).toBe(200)

  await page.reload()
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: /Ask AI about/ }).click()
  await expect(page.getByText(RESTATED)).toBeVisible()
  await expect(page.getByRole("button", { name: "Yes, do it" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Not quite" })).toBeVisible()

  const row = await prisma.aiThread.findFirstOrThrow({ where: { clientId } })
  const msgs = row.messages as { role: string; check?: { intent: string } }[]
  expect(msgs.find((m) => m.role === "user")?.check?.intent).toBe("change_exercises")
})

test("in the panel: a client sees the confirm card too", async ({ browser }) => {
  const w = await seedSession(`${PREFIX}Confirm Client`)
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: true } })
  const { ctx, page } = await clientContext(browser)
  try {
    const bodies = await mockConfirm(page, w)
    await page.waitForLoadState("networkidle")
    await page.getByRole("button", { name: /Ask AI about/ }).click()
    await page.getByPlaceholder("Ask a question or describe a change").fill("harder")
    await page.getByRole("button", { name: "Send" }).click()
    await expect(page.getByText(RESTATED)).toBeVisible()
    await page.getByRole("button", { name: "Yes, do it" }).click()
    await expect(page.getByText("Eased the squat.")).toBeVisible()
    expect(bodies[1].confirmed).toBe(true)
  } finally {
    await ctx.close()
    await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: false } })
  }
})

test("thread writes go out one at a time, in order, so a slow save can never land after a later one", async () => {
  const calls: { method: string; body: string; done: () => void }[] = []
  const fakeFetch = (_url: string, init?: { method?: string; body?: string }) =>
    new Promise<{ ok: boolean }>((resolve) => {
      calls.push({ method: init?.method ?? "GET", body: String(init?.body ?? ""), done: () => resolve({ ok: true }) })
    })
  const writer = createThreadWriter("c1", fakeFetch as unknown as typeof fetch)
  const first = writer.save([{ role: "user", text: "one" }])
  const second = writer.save([{ role: "user", text: "one" }, { role: "assistant", text: "two" }])
  const third = writer.clear()
  await new Promise((r) => setTimeout(r, 20))
  // Only the first request has gone out; the others wait for it.
  expect(calls.map((c) => c.method)).toEqual(["PUT"])
  calls[0].done()
  await new Promise((r) => setTimeout(r, 20))
  expect(calls.map((c) => c.method)).toEqual(["PUT", "PUT"])
  expect(calls[1].body).toContain("two")
  calls[1].done()
  await new Promise((r) => setTimeout(r, 20))
  expect(calls.map((c) => c.method)).toEqual(["PUT", "PUT", "DELETE"])
  calls[2].done()
  await Promise.all([first, second, third])
})

test("the switch can always be turned off, even after the coach's plan loses the assistant", async ({ page }) => {
  const before = await prisma.coachProfile.findUniqueOrThrow({ where: { userId: coachId }, select: { createdAt: true } })
  try {
    // 30 days in: the trial is over and the test coach is on Free, which has no assistant.
    await prisma.coachProfile.update({ where: { userId: coachId }, data: { createdAt: new Date(Date.now() - 30 * 86_400_000) } })
    await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: true } })
    await page.goto(`/coach/clients/${clientId}`)
    const box = page.getByRole("checkbox", { name: /Client can ask AI/ })
    await expect(box).toBeChecked()
    await box.uncheck()
    await expect.poll(async () => (await prisma.clientProfile.findUniqueOrThrow({ where: { userId: clientId } })).canAskAi).toBe(false)
    await page.reload()
    await expect(page.getByText(/Ask AI for clients comes with Pro/)).toBeVisible()
    await expect(page.getByRole("checkbox", { name: /Client can ask AI/ })).toBeHidden()
  } finally {
    await prisma.coachProfile.update({ where: { userId: coachId }, data: { createdAt: before.createdAt } })
    await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: false } })
  }
})

test("in the panel: at the cap the box is switched off", async ({ page }) => {
  await prisma.aiUsage.create({ data: { coachId, kind: "assist", model: "test", costUsd: 25.5 } })
  await openPanel(page)
  await expect(page.getByPlaceholder("Monthly AI limit reached")).toBeDisabled()
  await expect(page.getByText("$25.50 of $25")).toBeVisible()
})

// ---------- load bumps apply themselves, unless switched off ----------

async function bumpProposal(w: { id: string; name: string; scheduledDate: Date }, ex: { id: string }, autoApply: boolean) {
  return {
    reply: "Bumped the squat a notch.",
    changes: [
      { action: "modify", workoutId: w.id, workoutName: w.name, date: dayKey(w.scheduledDate), exerciseId: ex.id, exercise: "Back Squat", currentPrescription: "3x5 @ RPE 7, rest 2 min", newPrescription: "3x5 @ RPE 8, rest 2 min", reason: "Felt easy" },
    ],
    warnings: [],
    dropped: [],
    autoApply,
    meter: { spent: 0.1, cap: 25, level: "ok" },
  }
}

test("a load bump applies on its own, says so, and can be undone", async ({ page }) => {
  const w = await seedSession(`${PREFIX}Auto Bump`)
  const squat = w.exercises[0]
  await page.route("**/api/ai/assist", async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    await route.fulfill({ json: await bumpProposal(w, squat, true) })
  })

  await openPanel(page)
  await page.getByPlaceholder("Ask a question or describe a change").fill("Squats felt easy")
  await page.getByRole("button", { name: "Send" }).click()

  // No Apply button was pressed.
  await expect(page.getByText(/Applied 1 load change automatically/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole("button", { name: /^Apply \d/ })).toBeHidden()
  expect((await prisma.workoutExercise.findUniqueOrThrow({ where: { id: squat.id } })).prescription).toBe("3x5 @ RPE 8, rest 2 min")

  const undone = page.waitForResponse((r) => r.url().includes("/api/ai/assist/undo"))
  await page.getByRole("button", { name: "Undo" }).click()
  expect((await undone).status()).toBe(200)
  await expect.poll(async () => (await prisma.workoutExercise.findUniqueOrThrow({ where: { id: squat.id } })).prescription).toBe("3x5 @ RPE 7, rest 2 min")
})

test("with the switch off, a load bump waits for Apply like anything else", async ({ page }) => {
  const w = await seedSession(`${PREFIX}Manual Bump`)
  const squat = w.exercises[0]
  await page.route("**/api/ai/assist", async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    await route.fulfill({ json: await bumpProposal(w, squat, true) })
  })

  await openPanel(page)
  await page.getByLabel(/Apply load bumps automatically/).uncheck()
  await page.getByPlaceholder("Ask a question or describe a change").fill("Squats felt easy")
  await page.getByRole("button", { name: "Send" }).click()

  const apply = page.getByRole("button", { name: "Apply 1 change" })
  await expect(apply).toBeVisible()
  // Nothing has been written yet.
  expect((await prisma.workoutExercise.findUniqueOrThrow({ where: { id: squat.id } })).prescription).toBe("3x5 @ RPE 7, rest 2 min")
  await apply.click()
  await expect(page.getByText(/Applied 1 change to/)).toBeVisible()
  await page.evaluate(() => localStorage.removeItem("ai-auto-load")) // leave the switch as we found it
})

// ---------- creating whole sessions ----------

test("create: a new session needs a date from today on, a name, and at least one complete exercise", () => {
  const answer = JSON.stringify({
    reply: "Added swim sessions.",
    changes: [
      { action: "create", date: "2026-10-03", name: "Swim: Efficiency Drills", exercises: [{ name: "Goblet Squat", prescription: "3x8" }, { name: "Catch-Up Drill", prescription: "4x50 m, rest 20 s" }, { name: "No prescription" }], reason: "weekly swim" },
      { action: "create", date: "2026-09-29", name: "Yesterday", exercises: [{ name: "Goblet Squat", prescription: "3x8" }], reason: "in the past" },
      { action: "create", date: "2026-10-03", name: "Empty", exercises: [], reason: "no exercises" },
      { action: "create", date: "soon", name: "Bad date", exercises: [{ name: "Goblet Squat", prescription: "3x8" }], reason: "bad date" },
      { action: "create", date: "2026-10-04", exercises: [{ name: "Goblet Squat", prescription: "3x8" }], reason: "no name" },
    ],
    warnings: [],
  })
  const p = parseProposal(answer, ctx, match, libName)
  expect(p.changes).toHaveLength(1)
  const c = p.changes[0]
  expect(c).toMatchObject({ action: "create", workoutId: "", workoutName: "Swim: Efficiency Drills", date: "2026-10-03", reason: "weekly swim" })
  // Each exercise is matched to the library like an add, and an incomplete one is left out of the session, not fatal.
  expect(c.exercises).toEqual([
    { name: "Goblet Squat", prescription: "3x8", libraryId: "lib1", inLibrary: true },
    { name: "Catch-Up Drill", prescription: "4x50 m, rest 20 s", libraryId: null, inLibrary: false },
  ])
  expect(p.dropped).toEqual([
    "A new session on 2026-09-29 is in the past, so it was left out.",
    "A new session (Empty) had no complete exercises.",
    "A new session had no date in the form YYYY-MM-DD.",
    "A new session on 2026-10-04 had no name.",
  ])
  // Creating a session is never a load bump.
  expect(p.autoApply).toBe(false)
})

test("move, delete and add-first apply for real, and undo puts all of it back", async ({ page }) => {
  const w = await seedSession(`${PREFIX}Move Me`)
  const gone = await seedSession(`${PREFIX}Cancel Me`)
  const from = dayKey(w.scheduledDate)
  const to = new Date(w.scheduledDate.getTime() + 2 * 86_400_000)
  const res = await page.request.post("/api/ai/assist/apply", {
    data: {
      clientId,
      request: "move it, cancel the other, breathing first",
      changes: [
        { action: "move", workoutId: w.id, newDate: dayKey(to) },
        { action: "add", workoutId: w.id, newExercise: "Breathing A", newPrescription: "2x5 breaths", position: "start" },
        { action: "add", workoutId: w.id, newExercise: "Breathing B", newPrescription: "2x5 breaths", position: "start" },
        { action: "delete", workoutId: gone.id },
      ],
    },
  })
  expect(res.ok()).toBe(true)
  const out = await res.json()
  expect(out.applied).toBe(4)

  const moved = await prisma.workout.findUniqueOrThrow({ where: { id: w.id }, include: { exercises: { orderBy: { order: "asc" } } } })
  expect(dayKey(moved.scheduledDate)).toBe(dayKey(to))
  expect(dayKey(moved.originalDate!)).toBe(from)
  // Both first, in the order they were asked for, then the session as it was.
  expect(moved.exercises.map((e) => e.name)).toEqual(["Breathing A", "Breathing B", "Back Squat", "Strict Press", "Inverted row"])
  expect(await prisma.workout.findUnique({ where: { id: gone.id } })).toBeNull()

  const undo = await page.request.post("/api/ai/assist/undo", { data: { changeSetId: out.changeSetId } })
  expect(undo.ok()).toBe(true)
  const back = await prisma.workout.findUniqueOrThrow({ where: { id: w.id }, include: { exercises: { orderBy: { order: "asc" } } } })
  expect(dayKey(back.scheduledDate)).toBe(from)
  expect(back.originalDate).toBeNull()
  expect(back.exercises.map((e) => e.name)).toEqual(["Back Squat", "Strict Press", "Inverted row"])
  // The cancelled session is back with the same ids and its coaching notes.
  const restored = await prisma.workout.findUniqueOrThrow({ where: { id: gone.id }, include: { exercises: { orderBy: { order: "asc" } } } })
  expect(restored.exercises.map((e) => e.id)).toEqual(gone.exercises.map((e) => e.id))
  expect(restored.exercises[0].notes).toBe("Brace hard")
})

test("a session with logs is never deleted, and a client can't cancel sessions at all", async ({ page, browser }) => {
  const w = await seedSession(`${PREFIX}Logged`)
  await prisma.workoutComment.create({ data: { workoutId: w.id, authorId: coachId, authorName: "Coach", body: "Nice" } })
  const res = await page.request.post("/api/ai/assist/apply", { data: { clientId, request: "cancel", changes: [{ action: "delete", workoutId: w.id }] } })
  const out = await res.json()
  expect(out.applied).toBe(0)
  expect(out.skipped.join(" ")).toContain("not deleted")
  expect(await prisma.workout.findUnique({ where: { id: w.id } })).not.toBeNull()
  void browser
})

test("create: applying makes a standalone session with its exercises; undo removes it unless something was logged", async ({ page, browser }) => {
  const date = dayKey(tomorrow())
  const res = await page.request.post("/api/ai/assist/apply", {
    data: {
      clientId,
      request: "weekly swim",
      changes: [
        { action: "create", workoutId: "", date, workoutName: `${PREFIX}Swim Drills`, exercises: [{ name: "Goblet Squat", prescription: "3x8", libraryId: null }, { name: "Catch-Up Drill", prescription: "4x50 m" }] },
        { action: "create", workoutId: "", date: "2020-01-01", workoutName: `${PREFIX}Past`, exercises: [{ name: "Goblet Squat", prescription: "3x8" }] }, // past: refused
        { action: "create", workoutId: "", date, workoutName: `${PREFIX}No Exercises`, exercises: [] }, // refused
      ],
    },
  })
  expect(res.ok()).toBe(true)
  const out = await res.json()
  expect(out.applied).toBe(1)
  expect(out.skipped).toHaveLength(2)
  const made = await prisma.workout.findFirstOrThrow({ where: { clientId, name: `${PREFIX}Swim Drills` }, include: { exercises: { orderBy: { order: "asc" } } } })
  expect(dayKey(made.scheduledDate)).toBe(date)
  // Stored at noon UTC like every other session, so no time zone can shift it to the day before.
  expect(made.scheduledDate.toISOString()).toBe(`${date}T12:00:00.000Z`)
  expect(made.dayOfWeek).toBe(made.scheduledDate.getUTCDay())
  expect(made.programId).toBeNull()
  expect(made.exercises.map((e) => [e.name, e.prescription, e.order])).toEqual([["Goblet Squat", "3x8", 1], ["Catch-Up Drill", "4x50 m", 2]])
  expect(await prisma.workout.count({ where: { clientId, name: { in: [`${PREFIX}Past`, `${PREFIX}No Exercises`] } } })).toBe(0)

  // Undo removes the whole session.
  const undo = await page.request.post("/api/ai/assist/undo", { data: { changeSetId: out.changeSetId } })
  expect(undo.ok()).toBe(true)
  expect(await prisma.workout.findUnique({ where: { id: made.id } })).toBeNull()

  // But a created session the client has since logged on stays.
  const again = await page.request.post("/api/ai/assist/apply", {
    data: { clientId, request: "again", changes: [{ action: "create", workoutId: "", date, workoutName: `${PREFIX}Swim Logged`, exercises: [{ name: "Goblet Squat", prescription: "3x8" }] }] },
  })
  const out2 = await again.json()
  const logged = await prisma.workout.findFirstOrThrow({ where: { clientId, name: `${PREFIX}Swim Logged` }, include: { exercises: true } })
  const cctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const cp = await cctx.newPage()
  await cp.goto("/auth/signin")
  await cp.locator('input[name="email"]').fill("playwright-client@dev.local")
  await cp.locator('input[name="password"]').fill("playwright-test-PW-1")
  await cp.locator('button[type="submit"]').click()
  await cp.waitForURL(/\/client$/, { timeout: 15_000 })
  const log = await cp.request.put(`/api/workouts/${logged.id}/log`, {
    data: { exercises: [{ workoutExerciseId: logged.exercises[0].id, resultText: "", rpe: null, sets: [{ weight: 50, reps: 8, rpe: null, done: true }] }], complete: false },
  })
  expect(log.ok()).toBe(true)
  await cctx.close()
  const undo2 = await page.request.post("/api/ai/assist/undo", { data: { changeSetId: out2.changeSetId } })
  expect(undo2.ok()).toBe(true)
  expect((await undo2.json()).skipped[0]).toMatch(/logged/)
  expect(await prisma.workout.findUnique({ where: { id: logged.id } })).not.toBeNull()
})

test("in the panel: a new session shows as its own group with a CREATE row listing the exercises, and applies", async ({ page }) => {
  const date = dayKey(tomorrow())
  await page.route("**/api/ai/assist", async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    await route.fulfill({
      json: {
        reply: "Added a swim session.",
        changes: [
          { action: "create", workoutId: "", workoutName: `${PREFIX}Panel Swim`, date, exercises: [{ name: "Catch-Up Drill", prescription: "4x50 m", libraryId: null, inLibrary: false }, { name: "Kick Set", prescription: "6x25 m", libraryId: null, inLibrary: false }], reason: "Weekly swim" },
        ],
        warnings: [],
        dropped: [],
        autoApply: false,
        meter: { spent: 0.5, cap: 25, level: "ok" },
      },
    })
  })
  await openPanel(page)
  const dialog = page.getByRole("dialog", { name: "AI assistant" })
  await dialog.getByRole("textbox").fill("Add a weekly swim session")
  await dialog.getByRole("button", { name: "Send" }).click()
  await expect(dialog.getByText("create", { exact: true })).toBeVisible()
  // The name shows twice on purpose: as the group heading for the new date and in the row itself.
  await expect(dialog.getByText(`${PREFIX}Panel Swim`).first()).toBeVisible()
  await expect(dialog.getByText("Catch-Up Drill")).toBeVisible()
  await expect(dialog.getByText("Kick Set")).toBeVisible()
  await dialog.getByRole("button", { name: "Apply 1 change" }).click()
  await expect(dialog.getByText(/Applied 1 change/)).toBeVisible()
  const made = await prisma.workout.findFirstOrThrow({ where: { clientId, name: `${PREFIX}Panel Swim` }, include: { exercises: true } })
  expect(made.exercises).toHaveLength(2)
})

// ---------- big programs are asked about in parts ----------

const bigCtx = (n: number): Context => ({
  today: "2026-09-30",
  profile: "Units: lb",
  recent: "",
  sessions: Array.from({ length: n }, (_, i) => ({
    ref: `s${i + 1}`, id: `w${i + 1}`, date: `2026-10-${String(i + 1).padStart(2, "0")}`, name: `Day ${i + 1}`,
    exercises: [{ ref: `s${i + 1}e1`, id: `e${i + 1}`, name: "Broad Jump", rx: "3x5", locked: false, hasVideo: true }],
  })),
})

test("split: up to four sessions is one part; more are split in fours, refs unchanged, each part sees the rest by name only", () => {
  expect(splitContext(bigCtx(4))).toHaveLength(1)
  const parts = splitContext(bigCtx(10))
  expect(parts.map((p) => p.sessions.map((s) => s.ref))).toEqual([["s1", "s2", "s3", "s4"], ["s5", "s6", "s7", "s8"], ["s9", "s10"]])
  expect(parts.map((p) => p.part)).toEqual([{ index: 0, total: 3 }, { index: 1, total: 3 }, { index: 2, total: 3 }])
  const second = renderContext(parts[1])
  // Weekdays are spelled out, so "Thursday's session" lands on the right day.
  expect(second).toContain("s5  Mon 2026-10-05  Day 5")
  expect(second).toContain("s5e1  Broad Jump: 3x5")
  // The other parts' sessions are listed for context, without exercises or refs to edit.
  expect(second).toContain("2026-10-01  Day 1")
  expect(second).not.toContain("s1e1")
  expect(second).toMatch(/PART 2 OF 3/)
  expect(second).toMatch(/do not use "create"/i)
  expect(renderContext(parts[0])).not.toMatch(/do not use "create"/i)
  expect(renderContext(splitContext(bigCtx(3))[0])).not.toMatch(/PART/)
})

const prop = (over: Partial<Proposal>): Proposal => ({ reply: "", changes: [], warnings: [], dropped: [], autoApply: false, ...over })
const ch = (over: Partial<Change>): Change => ({ action: "modify", workoutId: "w", workoutName: "Day", date: "2026-10-01", exerciseId: "e", exercise: "Back Squat", currentPrescription: "3x8 @ RPE 6", newPrescription: "3x8 @ RPE 7", reason: "", ...over })

test("merge: one reply, all changes, warnings once, creates only from the first part, auto-apply judged on the whole", () => {
  const merged = mergeProposals([
    prop({ reply: "Made it easier across the program.", changes: [ch({ exerciseId: "e1" })], warnings: ["Check his knee"] }),
    prop({ reply: "Part two done.", changes: [ch({ exerciseId: "e5" }), ch({ action: "create", workoutId: "", exercises: [], exerciseId: undefined })], warnings: ["Check his knee", "Short on time"] }),
    null,
    prop({ reply: "", changes: [], dropped: ["That was too big to do in one go."] }),
  ])
  // Every part that changed something speaks; the empty part does not.
  expect(merged.reply).toBe("Made it easier across the program. Part two done.")
  expect(merged.changes.map((c) => c.exerciseId)).toEqual(["e1", "e5"])
  expect(merged.warnings).toEqual(["Check his knee", "Short on time"])
  expect(merged.dropped).toEqual([
    "A new session suggested for part 2 was left out (only the first part may add sessions).",
    "Part 3 of the program could not be reached; ask again for those sessions.",
    "That was too big to do in one go.",
  ])
  expect(merged.autoApply).toBe(false) // warnings present
  const bumps = mergeProposals([prop({ changes: [ch({ exerciseId: "e1" })] }), prop({ changes: [ch({ exerciseId: "e5" })] })])
  expect(bumps.autoApply).toBe(true)
  expect(bumps.reply).toBe("Here are the changes I'd make.")
})

test("part 1 owns asks about days no part holds; later parts do not", () => {
  const [first, second] = splitContext(bigCtx(10))
  expect(renderContext(first)).toMatch(/date that has no session/i)
  expect(renderContext(first)).toMatch(/new session/i)
  expect(renderContext(second)).not.toMatch(/date that has no session/i)
})

test("an empty answer never comes back as a bare 'Nothing to change'", () => {
  expect(explainEmpty(prop({ reply: "" })).reply).toBe(NOTHING_DONE)
  expect(explainEmpty(prop({ reply: "Nothing to change." })).reply).toBe(NOTHING_DONE)
  expect(mergeProposals([prop({}), prop({})]).reply).not.toBe("Nothing to change.")
  // A real answer, a warning, or a change is left alone.
  expect(explainEmpty(prop({ reply: "Squats are 3x5 on Monday." })).reply).toBe("Squats are 3x5 on Monday.")
  expect(explainEmpty(prop({ reply: "Nothing to change.", warnings: ["No barbell listed"] })).reply).toBe("Nothing to change.")
  expect(explainEmpty(prop({ reply: "", changes: [ch({})] })).reply).toBe("")
})
