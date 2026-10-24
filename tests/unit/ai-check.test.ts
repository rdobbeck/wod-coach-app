import test from "node:test"
import assert from "node:assert/strict"
import { askJev } from "../../lib/ai/decide"
import { preDecision, postDecision, postIntent, effectivePostDecision, shouldPostCheck, shouldPreCheck, answersQuestion, mayAutoApply, PRE_QUESTIONS, POST_QUESTIONS, preState, postState, changeLines, CLEAR_AT, QUESTION_AT, MISMATCH_AT } from "../../lib/ai/check"
import type { Context } from "../../lib/ai/assist"

const stub = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
const noul = { clear: { type: "noul", instructions: "x" } } as const

test("askJev returns answers and cost", async () => {
  const r = await askJev({}, noul, { fetchImpl: stub({ answers: { clear: { type: "noul", noul: 0.9 } }, usage: { cost: 0.00003 } }) })
  assert.equal(r.answers.clear.type === "noul" && r.answers.clear.noul, 0.9)
  assert.equal(r.costUsd, 0.00003)
})

test("askJev sends model, state and questions", async () => {
  let sent: { url?: unknown; init?: RequestInit } = {}
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    sent = { url, init }
    return new Response(JSON.stringify({ answers: { clear: { type: "noul", noul: 0.5 } } }))
  }) as unknown as typeof fetch
  const r = await askJev({ a: 1 }, noul, { fetchImpl })
  assert.equal(sent.url, "https://openrouter.ai/api/alpha/decisions")
  const body = JSON.parse(String(sent.init?.body))
  assert.deepEqual(body.state, { a: 1 })
  assert.deepEqual(body.questions, noul)
  assert.ok(body.model)
  assert.equal(r.costUsd, 0)
})

test("askJev rejects bad responses", async () => {
  await assert.rejects(askJev({}, noul, { fetchImpl: stub({}, 500) }))
  await assert.rejects(askJev({}, noul, { fetchImpl: stub({ answers: {} }) }))
  await assert.rejects(askJev({}, noul, { fetchImpl: stub({ answers: { clear: { type: "noul", noul: 1.4 } } }) }))
  const q = { intent: { type: "choice", instructions: "x", criteria: { a: "A", b: "B" } } } as const
  await assert.rejects(askJev({}, q, { fetchImpl: stub({ answers: { intent: { type: "choice", choice: "zzz", probabilities: {} } } }) }))
})

test("askJev times out", async () => {
  const hang = (() => new Promise(() => {})) as unknown as typeof fetch
  await assert.rejects(askJev({}, noul, { fetchImpl: hang, timeoutMs: 50 }))
})

test("preDecision", () => {
  const below = (t: number) => t - 0.01
  assert.equal(preDecision(null), "proceed")
  assert.equal(preDecision({ intent: "question", intentP: QUESTION_AT, clear: 0.01 }), "proceed")
  assert.equal(preDecision({ intent: "question", intentP: below(QUESTION_AT), clear: below(CLEAR_AT) }), "confirm")
  assert.equal(preDecision({ intent: "change_exercises", intentP: 1, clear: CLEAR_AT }), "proceed")
  assert.equal(preDecision({ intent: "change_exercises", intentP: 1, clear: below(CLEAR_AT) }), "confirm")
  assert.equal(preDecision({ intent: "unclear", intentP: 0.88, clear: 0.01 }), "confirm")
})

test("postDecision", () => {
  assert.equal(postDecision("question", 0.0, 0), "ok")
  assert.equal(postDecision("schedule", null, 0), "ok")
  assert.equal(postDecision("schedule", MISMATCH_AT, 0), "retry")
  assert.equal(postDecision("change_exercises", MISMATCH_AT, 3), "warn")
  assert.equal(postDecision("schedule", MISMATCH_AT + 0.01, 1), "ok")
})

test("shouldPostCheck runs unless a question produced no changes, and never when checks are off", () => {
  assert.equal(shouldPostCheck("question", 0, true), false)
  assert.equal(shouldPostCheck("question", 1, true), true)
  assert.equal(shouldPostCheck("schedule", 0, true), true)
  assert.equal(shouldPostCheck("change_exercises", 2, true), true)
  assert.equal(shouldPostCheck(null, 0, true), true)
  assert.equal(shouldPostCheck("schedule", 2, false), false)
  assert.equal(shouldPostCheck("question", 1, false), false)
})

test("postIntent: a question that produced changes is judged as unclear, so a miss still warns", () => {
  assert.equal(postIntent("question"), "unclear")
  assert.equal(postIntent(null), "unclear")
  assert.equal(postIntent("schedule"), "schedule")
  assert.equal(postDecision(postIntent("question"), MISMATCH_AT, 1), "warn")
  assert.equal(postDecision(postIntent("question"), MISMATCH_AT + 0.01, 1), "ok")
})

test("effectivePostDecision: only a successful non-question pre-check may retry", () => {
  const decide = (intent: Parameters<typeof postIntent>[0], matches: number, n: number) => effectivePostDecision(postDecision(postIntent(intent), matches, n), intent)
  assert.equal(decide(null, MISMATCH_AT, 0), "ok")
  assert.equal(decide("question", MISMATCH_AT, 0), "ok")
  assert.equal(decide("schedule", MISMATCH_AT, 0), "retry")
  assert.equal(decide(null, MISMATCH_AT, 2), "warn")
  assert.equal(decide("schedule", MISMATCH_AT + 0.01, 0), "ok")
})

test("the schedule criterion covers adding, moving and cancelling a session", () => {
  const c = PRE_QUESTIONS.intent.type === "choice" ? PRE_QUESTIONS.intent.criteria.schedule : ""
  assert.match(c, /new or extra session or workout/)
  assert.match(c, /move/i)
  assert.match(c, /cancel/i)
})

const ctx: Context = {
  sessions: [
    { ref: "S1", id: "w1", date: "2026-10-26", name: "Upper", exercises: [{ ref: "S1E1", id: "e1", name: "Back Squat", rx: "3x5", locked: false, hasVideo: true }] },
    { ref: "S2", id: "w2", date: "2026-10-28", name: "Lower", exercises: [] },
  ],
  profile: "",
  recent: "",
  today: "2026-10-24",
}

test("preState lists sessions without exercises and keeps 2 turns", () => {
  const turns = [1, 2, 3].map((i) => ({ role: "user" as const, content: `turn ${i} ${"x".repeat(400)}` }))
  const s = preState(ctx, "swap squats", turns)
  assert.ok(s.sessions.includes("Mon 2026-10-26"))
  assert.ok(!s.sessions.includes("Back Squat"))
  assert.equal(s.today, "2026-10-24")
  assert.equal(s.message, "swap squats")
  assert.ok(!s.recent_turns.includes("turn 1"))
  assert.ok(s.recent_turns.includes("turn 3"))
  assert.ok(s.recent_turns.length < 2 * 330)
})

test("postState carries the last 2 turns like preState, and matches reads them", () => {
  const turns = [1, 2, 3].map((i) => ({ role: "user" as const, content: `turn ${i} ${"x".repeat(400)}` }))
  const s = postState("yes", turns, [])
  assert.equal(s.message, "yes")
  assert.equal(s.proposed_changes, "none")
  assert.equal(s.recent_turns, preState(ctx, "yes", turns).recent_turns)
  assert.match(POST_QUESTIONS.matches.instructions, /recent_turns/)
})

test("changeLines is plain text", () => {
  const out = changeLines([
    { action: "create", workoutId: "", workoutName: "Swim: 20 min", date: "2026-10-24", reason: "", exercises: [{ name: "Freestyle Swim", prescription: "20 min", libraryId: null, inLibrary: false }, { name: "Kick", prescription: "4x50", libraryId: null, inLibrary: false }] },
    { action: "replace", workoutId: "w1", workoutName: "Upper", date: "2026-10-26", exercise: "Back Squat", newExercise: "Goblet Squat", reason: "" },
  ])
  assert.ok(out.includes('create Sat 2026-10-24 "Swim: 20 min" (Freestyle Swim, Kick)'))
  assert.ok(out.includes("replace Mon 2026-10-26 Upper: Back Squat -> Goblet Squat"))
  assert.ok(!/[–—]/.test(out))
})

test("shouldPreCheck runs only when checks are on and the ask is not a confirmed one", () => {
  assert.equal(shouldPreCheck({ confirmed: true, on: true }), false)
  assert.equal(shouldPreCheck({ confirmed: false, on: false }), false)
  assert.equal(shouldPreCheck({ confirmed: false, on: true }), true)
})

test("a reply to Ask AI's own question goes straight through: no confirm card for 'tomorrow' after 'Which day?'", () => {
  assert.equal(answersQuestion([{ role: "user", content: "Add a swim" }, { role: "assistant", content: "Which day should the swim go on?" }]), true)
  assert.equal(answersQuestion([{ role: "assistant", content: "Which day?  " }]), true)
  // A proposal that ends in a question is still a proposal, not a question to answer.
  assert.equal(answersQuestion([{ role: "assistant", content: "[Proposal discarded, nothing applied] Added it. Want more?" }]), false)
  assert.equal(answersQuestion([{ role: "assistant", content: "Squats are 3x5." }]), false)
  assert.equal(answersQuestion([]), false)
  assert.equal(answersQuestion([{ role: "assistant", content: "Which day?" }, { role: "user", content: "hm" }]), false)
})

test("edits that follow a Yes on a best guess, or an answer to Ask AI's question, never apply on their own", () => {
  assert.equal(mayAutoApply({ confirmed: true, answering: false }), false)
  assert.equal(mayAutoApply({ confirmed: false, answering: true }), false)
  assert.equal(mayAutoApply({ confirmed: false, answering: false }), true)
})
