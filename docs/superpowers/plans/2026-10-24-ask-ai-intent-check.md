# Ask AI Intent Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Ask AI's silent "Nothing to change" on empty-day asks, and add a Jev pre-check (confirm card for vague asks), a Jev post-check (one retry when a change ask produced nothing), and per-ask intent logging.

**Architecture:** Pure decision logic lives in `lib/ai/check.ts` and is unit tested with injected Jev answers. `lib/ai/decide.ts` is the only code that talks to OpenRouter's Decisions API, and `lib/ai/restate.ts` is the only code that calls the restating model. `app/api/ai/assist/route.ts` wires them in front of and behind the existing Sonnet calls, and every check fails open. The panel gets a confirm card and stores `check` on the user's message.

**Tech Stack:** Next.js 14 route handlers, TypeScript, Prisma, OpenRouter (chat completions + `/api/alpha/decisions`), Playwright (`npm run test:local`), node:test via tsx (`npm run test:unit`).

**Spec:** `docs/superpowers/specs/2026-10-24-ask-ai-intent-check-design.md`

## Global Constraints

- Work in worktree `~/wod-coach-ask-ai`, branch `feat/ask-ai-intent-check`. Commit as rdobbeck / ryandobbeck@gmail.com (already set repo-locally). End commit messages with the two attribution lines used in `d4b42ba`.
- No Prisma schema change and no DDL.
- No em or en dashes in user-facing copy; run model text through `noLongDashes` (`lib/text`).
- Jev model: `process.env.AI_CHECK_MODEL || "typesafe/jev-1.13"`. Restate model: `process.env.AI_RESTATE_MODEL || "anthropic/claude-haiku-5.5"`.
- Kill switch: `process.env.AI_CHECKS === "off"` skips both Jev checks and the confirm path.
- Every check fails open: any error from Jev or the restate model means "proceed exactly as today", logged with `console.warn("[ai-check]", ...)`.
- No client names or contact details go to Jev or the restate model (same rule as `buildContext`).
- Never call real models in automated tests. Live calls happen only in Task 5 (eval) and Task 8 (manual check).

## Review Focus

1. **Follow-up replies** ("yes", "tomorrow instead", "the 20 min one") after the assistant asked a question. They read as vague on their own, but history is in the Jev state. The Task 5 eval set includes these with history, and the target is that they pass.
2. **Tapping "Yes, do it" must never produce a second confirm card.** The request carries `confirmed: true` and the route skips the pre-check. Task 7's e2e test asserts the request body, and Task 6 has a unit test on `shouldPreCheck`.
3. **Jev down, slow or returning junk.** `askJev` throws on non-2xx, timeout, a missing answer or a probability outside 0..1; the route proceeds. Unit tests in Task 3 cover each throw, and `preDecision(null)` returns `"proceed"`.
4. **Old saved threads** (no `check`/`confirm`, and changes from before) must load unchanged, and new action types must survive a save. Unit tests in Task 2.
5. **Client viewer:** the confirm card and empty-reply copy read correctly when Murray (a client) is the one typing, and the meter and billing go to the coach. Task 7's e2e runs the confirm card as the client.

---

### Task 1: Part 1 owns empty days, and no bare "Nothing to change"

**Files:**
- Modify: `lib/ai/assist.ts` (`renderContext` PART text ~line 211; fallbacks at ~537 and ~578; new export)
- Modify: `app/api/ai/assist/route.ts` (apply `explainEmpty` to the final proposal)
- Test: `tests/ai-assist.spec.ts` (pure tests, next to the split/merge tests)

**Interfaces:**
- Produces: `export const NOTHING_DONE: string` and `export function explainEmpty(p: Proposal): Proposal` in `lib/ai/assist.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx playwright test tests/ai-assist.spec.ts -g "part 1 owns|bare 'Nothing" --project=chromium` (use the project name from `playwright.config.ts` if different)
Expected: FAIL (`explainEmpty` is not exported, and the ownership text is missing).

- [ ] **Step 3: Implement**

- In `renderContext`, for `ctx.part.index === 0` append: `' You also own any request about a date that has no session in the whole program, any request for a new session, and any request you cannot place in the OTHER UPCOMING SESSIONS list. Handle those here, using "create" when a new session is needed.'` Later parts keep their current text.
- `NOTHING_DONE = "I didn't find anything to change for that. To add a new session, name the day, like \"add a 20 min swim today\"."`
- `explainEmpty(p)`: if `p.changes.length === 0 && p.warnings.length === 0` and the reply is empty or matches `/^nothing to change\.?$/i`, return `{ ...p, reply: NOTHING_DONE }`; otherwise return `p` unchanged.
- In both fallbacks (`parseProposal`, `mergeProposals`) replace `"Nothing to change."` with `""`, so the explanation is applied in one place.
- In the route, wrap the final proposal in `explainEmpty(...)` before `NextResponse.json` (both return paths that carry a proposal).

- [ ] **Step 4: Run all pure assist tests**

Run: `npx playwright test tests/ai-assist.spec.ts -g "split|merge|part 1 owns|bare 'Nothing|checked before|clean JSON"`
Expected: PASS. The existing fenced test still sees the model's own "Nothing to change." from `parseProposal`, since `explainEmpty` only runs in the route.

- [ ] **Step 5: Commit**: `git commit -am "Ask AI: part 1 owns empty days; never a bare 'Nothing to change'"`

---

### Task 2: Saved threads keep every change action, plus `confirm` and `check`

**Files:**
- Modify: `lib/ai/thread.ts`
- Test: `tests/unit/ai-thread.test.ts` (new, node:test)

**Interfaces:**
- Produces: `ThreadChange.action` is widened to `Change["action"]` (all 8), with optional `exercises?: { name: string; prescription: string; libraryId: string | null; inLibrary: boolean }[]`, `newDate?: string` and `position?: "start"`.
- Produces: `ThreadMsg.confirm?: { kind: "restate" | "question"; text: string; answered?: boolean }` and `ThreadMsg.check?: { intent: Intent; clear: number; matches?: number }`, where `Intent` is imported as a type from `lib/ai/check.ts`. If Task 3 isn't merged yet, declare `type Intent = "question" | "change_exercises" | "schedule" | "videos" | "unclear"` locally and switch to the import in Task 3.
- `workoutId` may be `""` (for create).

- [ ] **Step 1: Write the failing tests** (`npm run test:unit` already globs `tests/unit/*.test.ts`)

```ts
test("create, move, delete and link changes survive a save", () => {
  const out = sanitizeMessages([{ role: "assistant", text: "Here you go", changes: [
    { action: "create", workoutId: "", workoutName: "Swim: 20 min", date: "2026-10-24", reason: "", exercises: [{ name: "Freestyle Swim", prescription: "20 min easy", libraryId: null, inLibrary: false }] },
    { action: "move", workoutId: "w1", workoutName: "Upper", date: "2026-10-26", newDate: "2026-10-27", reason: "" },
    { action: "delete", workoutId: "w2", workoutName: "Lower", date: "2026-10-28", reason: "" },
    { action: "link", workoutId: "w3", workoutName: "Upper", date: "2026-10-29", exerciseId: "e1", newExercise: "Pull-Up", libraryId: "lib1", inLibrary: true, reason: "" },
    { action: "add", workoutId: "w3", workoutName: "Upper", date: "2026-10-29", newExercise: "Breathing", newPrescription: "2 min", position: "start", reason: "" },
  ] }])
  assert.deepEqual(out[0].changes!.map((c) => c.action), ["create", "move", "delete", "link", "add"])
  assert.equal(out[0].changes![0].exercises![0].name, "Freestyle Swim")
  assert.equal(out[0].changes![1].newDate, "2026-10-27")
  assert.equal(out[0].changes![4].position, "start")
})

test("confirm and check are kept, bounded and typed; junk is dropped", () => {
  const [u, a] = sanitizeMessages([
    { role: "user", text: "harder", check: { intent: "change_exercises", clear: 0.01, matches: 2, extra: 1 } },
    { role: "assistant", text: "", confirm: { kind: "restate", text: "Raise RPE by 1 on every lift next week.", answered: true } },
  ])
  assert.deepEqual(u.check, { intent: "change_exercises", clear: 0.01 }) // out-of-range matches dropped
  assert.deepEqual(a.confirm, { kind: "restate", text: "Raise RPE by 1 on every lift next week.", answered: true })
  assert.equal(sanitizeMessages([{ role: "user", text: "x", check: { intent: "nope", clear: 0.5 } }])[0].check, undefined)
})

test("an old thread without the new fields loads unchanged", () => {
  const old = [{ role: "user", text: "ease the squat" }, { role: "assistant", text: "Done", changes: [{ action: "replace", workoutId: "w", workoutName: "Day", date: "2026-10-01", exerciseId: "e", exercise: "Back Squat", newExercise: "Goblet Squat", reason: "" }] }]
  const out = sanitizeMessages(old)
  assert.equal(out[0].check, undefined)
  assert.equal(out[1].changes![0].action, "replace")
  assert.equal(out[1].state, "pending")
})
```

Note: an assistant message whose `text` is `""` but carries `confirm` must be kept. Today `str("")` returns `""` (not undefined), so that already works; keep it that way.

- [ ] **Step 2: Run to verify they fail**: `npm run test:unit`. Expected: the first two tests FAIL.
- [ ] **Step 3: Implement** in `lib/ai/thread.ts`: widen `ACTIONS` to all eight actions. Allow `workoutId === ""` only for `create`. Bound `exercises` to 20 rows (strings 120/300 chars, `libraryId` string(64) or null). `newDate` must match `^\d{4}-\d{2}-\d{2}$`. `position` is only `"start"`. `confirm.kind` must be in the set and `text` is limited to 600 characters. `check.intent` must be in the five-value set. Keep `clear` and `matches` only if they're numbers in 0..1.
- [ ] **Step 4: Run**: `npm run test:unit`. Expected: PASS. Also run `npx playwright test tests/ai-assist.spec.ts -g "threads"`. Expected: PASS.
- [ ] **Step 5: Commit**: `git add lib/ai/thread.ts tests/unit/ai-thread.test.ts && git commit -m "Ask AI threads keep every change action, confirm and check"`

---

### Task 3: Jev client and check logic

**Files:**
- Create: `lib/ai/decide.ts` (the network call only)
- Create: `lib/ai/check.ts` (questions, state builders, decisions; pure)
- Test: `tests/unit/ai-check.test.ts`

**Interfaces:**
- Produces, in `decide.ts`:
  - `export const CHECK_MODEL = () => process.env.AI_CHECK_MODEL || "typesafe/jev-1.13"`
  - `export type Question = { type: "noul"; instructions: string } | { type: "choice"; instructions: string; criteria: Record<string, string> }`
  - `export type JevAnswer = { type: "noul"; noul: number } | { type: "choice"; choice: string; probabilities: Record<string, number> }`
  - `export async function askJev<K extends string>(state: unknown, questions: Record<K, Question>, opts?: { fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<{ answers: Record<K, JevAnswer>; costUsd: number }>`. Default timeout 3000 ms. Throws on non-2xx, a missing key, a `noul` outside 0..1, or a `choice` not among the criteria.
- Produces, in `check.ts`:
  - `export type Intent = "question" | "change_exercises" | "schedule" | "videos" | "unclear"`
  - `export const checksOn = () => process.env.AI_CHECKS !== "off"`
  - `export const CLEAR_AT: number`, `export const QUESTION_AT: number`, `export const MISMATCH_AT: number`. Start values are 0.5, 0.8 and 0.2; Task 5 sets the final ones.
  - `export const PRE_QUESTIONS: { clear: Question; intent: Question }` and `export const POST_QUESTIONS: { matches: Question }`
  - `export function preState(ctx: Context, message: string, history: Turn[]): { today: string; sessions: string; recent_turns: string; message: string }`. The `sessions` field is one line per session (`Sat 2026-10-24  Swim: Efficiency Drills`), using all of `ctx.sessions`. `recent_turns` is the last 2 turns, each cut to 300 characters.
  - `export function changeLines(changes: Change[]): string` gives one plain line per change, for example `create Sat 2026-10-24 "Swim: 20 min" (Freestyle Swim, Kick)` or `replace Mon 2026-10-26 Upper: Back Squat -> Goblet Squat`. Use "->", not a dash character.
  - `export type PreCheck = { intent: Intent; intentP: number; clear: number }`, where `intentP` is the probability of the chosen intent.
  - `export function preDecision(check: PreCheck | null): "proceed" | "confirm"`. It returns `"proceed"` when the check is null (fail open), when intent is `question` and `intentP >= QUESTION_AT`, or when `clear >= CLEAR_AT`. Otherwise it returns `"confirm"`.
  - `export function postDecision(intent: Intent, matches: number | null, changeCount: number): "ok" | "retry" | "warn"`. It returns `"ok"` when intent is `question`, when `matches` is null, or when `matches > MISMATCH_AT`. Otherwise it returns `"retry"` if `changeCount === 0`, else `"warn"`.
  - `export const MISMATCH_WARNING = "These edits may not be what you asked for. Check before applying."`

- [ ] **Step 1: Write the failing tests**:
  - `askJev` with a stub `fetchImpl` returning `{ answers: { clear: { type: "noul", noul: 0.9 } }, usage: { cost: 0.00003 } }` resolves to `answers.clear.noul === 0.9` and `costUsd === 0.00003`.
  - `askJev` rejects for a 500 response, for a missing answer key, for `noul: 1.4`, for a choice outside the criteria, and when `fetchImpl` never resolves within `timeoutMs: 50`.
  - `preDecision`:
    - `preDecision(null) === "proceed"`
    - `{ intent: "question", intentP: 0.95, clear: 0.01 }` gives `"proceed"`
    - `{ intent: "change_exercises", intentP: 1, clear: 0.9 }` gives `"proceed"`
    - `{ intent: "unclear", intentP: 0.88, clear: 0.01 }` gives `"confirm"`
  - `postDecision`:
    - `("question", 0.0, 0) === "ok"` and `("schedule", null, 0) === "ok"`
    - `("schedule", 0.05, 0) === "retry"`
    - `("change_exercises", 0.05, 3) === "warn"`
    - `("schedule", 0.9, 1) === "ok"`
  - `preState` on a context holding a Murray-like session list contains `"Mon 2026-10-26"`, contains no exercise names, and `recent_turns` holds at most 2 turns.
  - `changeLines` on a create change mentions the date and the session name and contains no `–` or `—`.
- [ ] **Step 2: Run**: `npm run test:unit`. Expected: FAIL (the modules don't exist yet).
- [ ] **Step 3: Implement** both files. `askJev` POSTs `{ model: CHECK_MODEL(), state, questions }` to `https://openrouter.ai/api/alpha/decisions` with `Authorization: Bearer ${process.env.OPENROUTER_API_KEY}`, and uses `AbortSignal.timeout(timeoutMs)` when `fetchImpl` is the global fetch, otherwise `Promise.race` with a timer. `costUsd` is `usage.cost ?? 0`. Starting question wording (Task 5 tunes it):
  - `clear`: "`message`, read together with `recent_turns`, says what to change in the client's training (which day or sessions, and what change), or asks a question, clearly enough that a strength coach could act on it without guessing."
  - `intent` criteria: as in the spec.
  - `matches`: "The changes in `proposed_changes` carry out what `message` asks for. Zero changes does not carry out a request to change something."
- [ ] **Step 4: Run**: `npm run test:unit`. Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -m "Ask AI: Jev client and check decisions"`

---

### Task 4: Restating model

**Files:**
- Create: `lib/ai/restate.ts`
- Test: `tests/unit/ai-restate.test.ts`

**Interfaces:**
- Consumes: `preState` from Task 3 (same compact session list).
- Produces:
  - `export const RESTATE_MODEL = () => process.env.AI_RESTATE_MODEL || "anthropic/claude-haiku-5.5"`
  - `export function parseRestate(raw: string): { kind: "restate" | "question"; text: string } | null`
  - `export async function restate(state: ReturnType<typeof preState>, viewer: "coach" | "client", opts?: { fetchImpl?: typeof fetch }): Promise<{ kind: "restate" | "question"; text: string; costUsd: number }>`. It throws on any failure or an unparseable answer.

- [ ] **Step 1: Write the failing tests** for `parseRestate`:
  - `'{"kind":"restate","text":"Add a new 20-minute swim session today, Sat Oct 24."}'` parses as is.
  - A reply wrapped in a code fence still parses (reuse `extractJson`-style tolerance: try `JSON.parse`, then the first `{...}` span).
  - Text containing an em dash comes back with no em dash.
  - Text longer than 600 characters is cut to 600.
  - `kind: "other"` returns null, an empty text returns null, and non-JSON returns null.
  - `restate` with a stub `fetchImpl` returning a chat completion whose content is that JSON resolves with `costUsd` from `usage.cost`.
- [ ] **Step 2: Run**: `npm run test:unit`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use a POST to `https://openrouter.ai/api/v1/chat/completions` with `max_tokens: 200`, `usage: { include: true }`, a 15 s timeout, and this system prompt (exact intent, the wording is the builder's): restate the message as ONE concrete instruction a programmer could carry out. Use only what the person said. Resolve "today", "tomorrow" and weekday names to dates from `sessions` and `today`. Never invent exercises, numbers or days they didn't give. If it truly can't tell what they want, return one short question instead. Write in the person's own voice (first person if `viewer` is `client`, about "the client" if `coach`). Reply only with JSON `{"kind":"restate"|"question","text":"..."}`. No dashes.
- [ ] **Step 4: Run**: `npm run test:unit`. Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -m "Ask AI: restating model for the confirm card"`

---

### Task 5: Eval script and tuned thresholds (live, about $0.01 total)

**Files:**
- Create: `scripts/eval-ai-check.ts`
- Modify: `lib/ai/check.ts` (final `CLEAR_AT`, `QUESTION_AT`, `MISMATCH_AT` and question wording)

**Interfaces:**
- Consumes: `askJev`, `PRE_QUESTIONS`, `POST_QUESTIONS`, `preState`, `changeLines`, `preDecision`, `postDecision`.

- [ ] **Step 1: Write the script.** It builds a fixed Murray-like context in code (sessions Mon 10-26 Full Body A, Wed 10-28 Swim, Thu 10-29 Full Body B, Mon 11-02 Full Body A; today 2026-10-24), with no database. It runs each labelled case through the pre-check and prints `clear`, `intent`, the decision and the expected decision, and exits 1 if any case misses. Cases, with expected decision:
  - **proceed:**
    - the three `EXAMPLES_COACH` and three `EXAMPLES_CLIENT` prompts from `AiAssistant.tsx`
    - "Add a swim workout for today as a fresh workout. Keep it 20 minutes long"
    - "I'm going swimming today. Can I have a 20-minute workout or swim?"
    - "swap the back squat on monday for goblet squat 3x10"
    - "move Thursday's session to Friday"
    - "can you add videos to everything missing one"
    - "what should I eat before training?"
    - with history `[assistant: "Do you want it today or tomorrow?"]`: "tomorrow"
    - with history `[assistant: "Want me to cancel Wednesday's swim?"]`: "yes"
  - **confirm:** "make it better", "harder", "fix it", "change stuff", "do the thing we talked about" (no history)
  - **post-check:** for "Add a 20 minute swim today", zero changes must give `retry`, and one create change on 2026-10-24 must give `ok`. For "swap monday's back squat for goblet squat", a change that removes Thursday's farmer carry must give `warn`.
- [ ] **Step 2: Run** `npx tsx --env-file=.env.local scripts/eval-ai-check.ts`. Record the output.
- [ ] **Step 3: Tune** the question wording and the three thresholds in `check.ts` until the script exits 0. Change the wording before the thresholds. Don't add special cases for individual phrases. If after five honest rounds a case still can't pass, stop and report which case fails and its scores rather than forcing it.
- [ ] **Step 4: Re-run `npm run test:unit`.** Unit tests that hard-code the old thresholds must be updated to use the exported constants, never the literals.
- [ ] **Step 5: Commit**: `git commit -m "Ask AI: eval script and tuned check thresholds"`, and paste the final eval output into the commit body.

---

### Task 6: Wire the checks into the assist route

**Files:**
- Modify: `app/api/ai/assist/route.ts`
- Modify: `lib/ai/check.ts` (add `shouldPreCheck`)
- Test: `tests/unit/ai-check.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 3 and 4. `settleAiCall(coachId, { mode }, { kind: "assist", clientId, model, costUsd, tokensIn, tokensOut })`.
- Produces: the request body adds `confirmed?: boolean`. Responses:
  - **Proposal:** `{ ...Proposal, check?: { intent, clear, matches? }, meter }`
  - **Confirm:** `{ confirm: { kind: "restate" | "question", text }, check: { intent, clear }, meter }`, with no `changes` key.
- `export function shouldPreCheck(opts: { confirmed: boolean; on: boolean }): boolean` returns `on && !confirmed`.

- [ ] **Step 1: Failing unit test** for `shouldPreCheck`: `({ confirmed: true, on: true }) === false`, `({ confirmed: false, on: false }) === false`, `({ confirmed: false, on: true }) === true`.
- [ ] **Step 2: Run**: `npm run test:unit`. Expected: FAIL.
- [ ] **Step 3: Implement the route flow**, in this order:
  1. Run the existing validation, access and funding steps (unchanged), then parse `confirmed = body.confirmed === true`.
  2. Run `ctx = await buildContext(...)` as today.
  3. Pre-check. If `shouldPreCheck({ confirmed, on: checksOn() })`, try `askJev(preState(ctx, message, history), PRE_QUESTIONS)` and build `PreCheck`. On a catch, set `check = null` and warn. Keep `preCost`.
  4. If `preDecision(check) === "confirm"`, try `restate(preState(...), access.viewer)`.
     - On success, settle one `assist` row with `model: RESTATE_MODEL()` and `costUsd: preCost + r.costUsd`, then return the confirm response.
     - On a restate catch, fall through and proceed. `preCost` then rides on part 1 (step 5).
  5. Run the existing Sonnet parts. When settling part index 0, add `preCost` to its `costUsd`. Everything else is unchanged.
  6. Merge as today, giving `proposal`.
  7. Post-check, only if `checksOn()` and `check?.intent !== "question"`. Try `askJev({ message, proposed_changes: changeLines(proposal.changes) || "none" }, POST_QUESTIONS)`; a catch gives null.
     - Run `decision = postDecision(check?.intent ?? "unclear", matches, proposal.changes.length)`.
     - On `"retry"`, if `Date.now() - started < 50_000`, call `callModel(parts[0], message + "\n\nYour previous answer made no changes. The request is a change; make it, or ask one specific question.", history)` once. Settle it as its own row with the post-check cost added. If its parsed proposal has changes, it replaces `proposal` (the single-part parse path, using `parts[0]`).
     - On `"warn"`, push `MISMATCH_WARNING` into `proposal.warnings` and set `autoApply = false`.
  8. Return `NextResponse.json({ ...explainEmpty(proposal), check: check && { intent, clear, matches }, meter })`.

  `started` is `Date.now()` at the top of the handler. When `check` is null (checks off, a Jev error, or `confirmed`), the response omits `check`.
- [ ] **Step 4: Run** `npm run test:unit` and `npx tsc --noEmit -p .`. Expected: PASS, with no type errors.
- [ ] **Step 5: Run** `npx playwright test tests/ai-assist.spec.ts` (the full file; it mocks `/api/ai/assist`, so the route changes must not break the panel). Expected: PASS.
- [ ] **Step 6: Commit**: `git commit -am "Ask AI route: Jev pre-check, confirm path, post-check retry"`

---

### Task 7: Confirm card in the panel

**Files:**
- Modify: `components/coach/AiAssistant.tsx`
- Test: `tests/ai-assist.spec.ts` (panel e2e, mocked route)

**Interfaces:**
- Consumes: the Task 6 response shapes and the Task 2 `Msg.confirm` / `Msg.check` (mirror them on the panel's `Msg` type).

- [ ] **Step 1: Write the failing e2e tests.** Mock `/api/ai/assist` with the same `page.route` pattern as `mockReply`.
  - **"in the panel: a vague ask shows what it understood; Yes sends it confirmed"**
    - The first POST returns `{ confirm: { kind: "restate", text: "Raise the effort by one RPE on every lift next week." }, check: { intent: "change_exercises", clear: 0.01 }, meter }`.
    - Type "harder" and send. Expect the text to be visible, along with the buttons "Yes, do it" and "Not quite".
    - Click "Yes, do it". Expect the second POST body to have `confirmed: true` and `message: "Raise the effort by one RPE on every lift next week."`. Its mocked proposal reply is visible, and "Yes, do it" is gone.
  - **"in the panel: Not quite puts the restatement in the box to edit"**
    - After the card, click "Not quite". The textarea value equals the restated text and no second POST was made.
  - **"in the panel: a restate question shows with no buttons"**
    - The POST returns `kind: "question"`. The text is visible and there's no "Yes, do it".
  - **"in the panel: the card and the intent survive a reload"**
    - After the card shows, reload and reopen the panel. The card text and buttons are still there, and the thread row in the DB holds `check.intent` on the user message.
  - **"in the panel: a client sees the confirm card too"**
    - Use the existing `clientContext(browser)` helper, with the coach switch on as in the existing client test. The card shows and Yes works.
- [ ] **Step 2: Run**: `npx playwright test tests/ai-assist.spec.ts -g "in the panel"`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement**
  - `send(text, opts?: { confirmed?: boolean })` puts `confirmed` in the body.
  - When `d.confirm` is set, append an assistant `Msg` with `text: d.confirm.text` and `confirm: { kind, text }`, and set `check` on the user message just sent.
  - When `d.check` is set on a proposal reply, also set it on that user message.
  - Card buttons are shown only when `confirm.kind === "restate" && !confirm.answered`:
    - "Yes, do it" calls `patch(i, { confirm: { ...c, answered: true } })` then `send(c.text, { confirmed: true })`.
    - "Not quite" calls `patch(i, { confirm: { ...c, answered: true } })`, `setInput(c.text)` and focuses the textarea.
  - Style the buttons like Apply and Discard. The history sent to the server keeps using `m.text`.
- [ ] **Step 4: Run**: `npx playwright test tests/ai-assist.spec.ts`. Expected: everything PASSES.
- [ ] **Step 5: Commit**: `git commit -am "Ask AI panel: confirm card for vague asks"`

---

### Task 8: Live verification and branch review

**Files:** none new (a temporary seed script is deleted after use)

- [ ] **Step 1:** Start the dev server against preview (`npm run dev`, which uses `.env.local` with `DB_SCHEMA=preview`).
- [ ] **Step 2:** Seed a preview client with 8+ upcoming sessions and nothing today. Sign in as its coach (the playwright coach on preview). Send "Add a swim workout for today as a fresh workout. Keep it 20 minutes long". Expect a CREATE proposal dated today, with no confirm card, and `check.intent === "schedule"` in the saved thread.
- [ ] **Step 3:** Send "harder". Expect a confirm card. Tap Yes and expect a proposal.
- [ ] **Step 4:** Restart with `AI_CHECKS=off` and send "harder". Expect a proposal or question straight away, with no card.
- [ ] **Step 5:** Delete the seeded rows. Run `npm run test:unit` and `npx playwright test tests/ai-assist.spec.ts tests/ai-client.spec.ts`. Expected: PASS.
- [ ] **Step 6:** Dispatch a fresh reviewer (superpowers:requesting-code-review) on the branch diff against `origin/master`, fix what it confirms, then hand back to Ryan before merging. Pushing to master deploys to production, and it needs Ryan's go.
