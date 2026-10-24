import test from "node:test"
import assert from "node:assert/strict"
import { weekRanges } from "../../lib/ai/days"
import { parseScope, narrowContext, scopeState, scope, SCOPE_MODEL } from "../../lib/ai/scope"
import type { Context } from "../../lib/ai/assist"

const days = ["2026-10-26", "2026-10-28", "2026-10-30", "2026-11-02", "2026-11-04", "2026-11-06"]
const ctx: Context = {
  today: "2026-10-24",
  profile: "",
  recent: "",
  sessions: days.map((date, i) => ({ ref: `s${i + 1}`, id: `w${i + 1}`, date, name: `Day ${i + 1}`, exercises: [] })),
}
const refs = ctx.sessions.map((s) => s.ref)

test("parseScope keeps known refs in program order, and reads all, none and junk", () => {
  assert.deepEqual(parseScope('{"refs":["s6","s3","s99"]}', refs), ["s3", "s6"])
  assert.equal(parseScope('{"refs":"all"}', refs), "all")
  assert.deepEqual(parseScope('```json\n{"refs":[]}\n```', refs), [])
  assert.equal(parseScope("I think s3", refs), null)
  assert.equal(parseScope('{"refs":"some"}', refs), null)
})

test("narrowing keeps only the asked-about sessions; the rest stay visible by date and name", () => {
  const n = narrowContext(ctx, ["s3"])
  assert.deepEqual(n.sessions.map((s) => s.ref), ["s3"])
  assert.deepEqual(n.others?.map((o) => o.date), ["2026-10-26", "2026-10-28", "2026-11-02", "2026-11-04", "2026-11-06"])
  // Nothing to narrow: all sessions, or none named (a new session, an empty day), leaves the context as it was.
  assert.equal(narrowContext(ctx, "all"), ctx)
  assert.equal(narrowContext(ctx, []), ctx)
  assert.equal(narrowContext(ctx, refs), ctx)
})

test("the scope prompt keeps sessions the message only refers to, since narrowing hides their exercises", async () => {
  let body: any = null
  const fetchImpl = (async (_u: string, init: any) => {
    body = JSON.parse(init.body)
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"refs":["s1","s3"]}' } }] }), { status: 200 })
  }) as typeof fetch
  await scope(ctx, "Make Friday the same as Monday", [], { fetchImpl })
  assert.match(body.messages[0].content, /refers to/)
})

test("the scope state shows the whole program by date and name only, with day names and recent talk", () => {
  const s = scopeState(ctx, "Remove the knee raise on Friday", [{ role: "assistant", content: "Which day?" }])
  assert.match(s.sessions, /s3  Fri 2026-10-30  Day 3/)
  assert.match(s.day_names, /Friday 2026-10-30/)
  assert.equal(s.recent_turns, "assistant: Which day?")
  assert.equal(s.weeks, "this week: 2026-10-19 to 2026-10-25\nnext week: 2026-10-26 to 2026-11-01")
})

test("weeks run Monday to Sunday, from any day of the week, across a year end", () => {
  assert.equal(weekRanges("2026-10-26"), "this week: 2026-10-26 to 2026-11-01\nnext week: 2026-11-02 to 2026-11-08")
  assert.equal(weekRanges("2026-11-01"), "this week: 2026-10-26 to 2026-11-01\nnext week: 2026-11-02 to 2026-11-08")
  assert.equal(weekRanges("2026-12-31"), "this week: 2026-12-28 to 2027-01-03\nnext week: 2027-01-04 to 2027-01-10")
})

test("scope sends Haiku with reasoning off and reads its refs and cost", async () => {
  let body: any = null
  const fetchImpl = (async (_url: string, init: any) => {
    body = JSON.parse(init.body)
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"refs":["s3"]}' } }], usage: { cost: 0.0002 } }), { status: 200 })
  }) as typeof fetch
  const r = await scope(ctx, "Remove the knee raise on Friday", [], { fetchImpl })
  assert.deepEqual(r, { refs: ["s3"], costUsd: 0.0002 })
  assert.equal(body.model, SCOPE_MODEL())
  assert.deepEqual(body.reasoning, { enabled: false })
})

test("scope throws on a bad answer, so the caller can fail open", async () => {
  const fetchImpl = (async () => new Response(JSON.stringify({ choices: [{ message: { content: "no idea" } }] }), { status: 200 })) as typeof fetch
  await assert.rejects(scope(ctx, "x", [], { fetchImpl }))
})
