import test from "node:test"
import assert from "node:assert/strict"
import { parseRestate, restate, RESTATE_MODEL } from "../../lib/ai/restate"

const state = { today: "2026-10-24", sessions: "Sat 2026-10-24  Swim: Efficiency Drills", recent_turns: "", message: "add a swim today" }
const ok = '{"kind":"restate","text":"Add a new 20-minute swim session today, Sat Oct 24."}'
const chat = (content: string, cost = 0.0004) =>
  (async () => new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { cost } }))) as unknown as typeof fetch

test("parseRestate parses plain JSON", () => {
  assert.deepEqual(parseRestate(ok), { kind: "restate", text: "Add a new 20-minute swim session today, Sat Oct 24." })
})

test("parseRestate tolerates code fences and surrounding prose", () => {
  assert.equal(parseRestate("```json\n" + ok + "\n```")?.kind, "restate")
  assert.equal(parseRestate("Here you go: " + ok + " Done.")?.kind, "restate")
})

test("parseRestate accepts a question", () => {
  assert.deepEqual(parseRestate('{"kind":"question","text":"Which day?"}'), { kind: "question", text: "Which day?" })
})

test("parseRestate strips long dashes and caps length", () => {
  const r = parseRestate('{"kind":"restate","text":"Swap squats — for lunges"}')
  assert.ok(r && !/[—–]/.test(r.text))
  assert.equal(parseRestate(JSON.stringify({ kind: "restate", text: "x".repeat(700) }))?.text.length, 600)
})

test("parseRestate rejects bad kinds, empty text and non-JSON", () => {
  assert.equal(parseRestate('{"kind":"other","text":"hi"}'), null)
  assert.equal(parseRestate('{"kind":"restate","text":"  "}'), null)
  assert.equal(parseRestate("not json"), null)
})

test("restate returns the parsed answer and cost", async () => {
  const r = await restate(state, "coach", { fetchImpl: chat(ok) })
  assert.equal(r.kind, "restate")
  assert.equal(r.costUsd, 0.0004)
})

test("restate sends model, usage flag, reasoning off, 400 tokens and no client details", async () => {
  let body: any
  process.env.OPENROUTER_API_KEY = "k"
  const fetchImpl = (async (_u: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ choices: [{ message: { content: ok } }] }))
  }) as unknown as typeof fetch
  const r = await restate(state, "client", { fetchImpl })
  assert.equal(body.model, RESTATE_MODEL())
  assert.equal(body.max_tokens, 400)
  // Haiku reasons by default on OpenRouter and spent the whole budget thinking (content null).
  assert.deepEqual(body.reasoning, { enabled: false })
  assert.deepEqual(body.usage, { include: true })
  assert.equal(r.costUsd, 0)
  // The prompt resolves "Friday" and "next week" with day_names, so they must be sent.
  const sent = JSON.parse(body.messages[1].content)
  assert.match(sent.day_names, /^Saturday 2026-10-24 \(today\)\nSunday 2026-10-25/)
})

test("restate throws on failure or an unparseable answer", async () => {
  await assert.rejects(restate(state, "coach", { fetchImpl: (async () => new Response("no", { status: 500 })) as unknown as typeof fetch }))
  await assert.rejects(restate(state, "coach", { fetchImpl: chat("nonsense") }))
})
