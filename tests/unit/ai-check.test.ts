import test from "node:test"
import assert from "node:assert/strict"
import { askJev } from "../../lib/ai/decide"
import { preDecision, postDecision, shouldPreCheck, preState, changeLines, CLEAR_AT, QUESTION_AT, MISMATCH_AT } from "../../lib/ai/check"
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
