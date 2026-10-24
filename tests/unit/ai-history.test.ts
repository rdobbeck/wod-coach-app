import test from "node:test"
import assert from "node:assert/strict"
import { historyFor } from "../../lib/ai/history"

test("proposals carry what became of them, so a discarded swim is not talked about as added", () => {
  const turns = historyFor([
    { role: "user", text: "Add a 20 min swim today" },
    { role: "assistant", text: "Added a swim session for today.", changes: [{}], state: "discarded" },
    { role: "user", text: "Swap Monday's raise" },
    { role: "assistant", text: "Swapped it.", changes: [{}], state: "applied" },
    { role: "assistant", text: "Bumped squats.", changes: [{}], state: "applied", undone: true },
    { role: "assistant", text: "Here is a change.", changes: [{}], state: "pending" },
    { role: "assistant", text: "Squats are 3x5 on Monday." },
  ])
  assert.deepEqual(
    turns.map((t) => t.content),
    [
      "Add a 20 min swim today",
      "[Proposal discarded, nothing applied] Added a swim session for today.",
      "Swap Monday's raise",
      "[Proposal applied] Swapped it.",
      "[Proposal applied, then undone] Bumped squats.",
      "[Proposal waiting for review, not applied] Here is a change.",
      "Squats are 3x5 on Monday.",
    ]
  )
  assert.deepEqual(turns.map((t) => t.role), ["user", "assistant", "user", "assistant", "assistant", "assistant", "assistant"])
})

test("failed messages are left out, as before", () => {
  const turns = historyFor([
    { role: "user", text: "hi" },
    { role: "assistant", text: "Could not reach the AI.", failed: true },
  ])
  assert.deepEqual(turns, [{ role: "user", content: "hi" }])
})

test("the tag survives the cuts made downstream (2000 chars on the server, 300 in the checks)", () => {
  const [t] = historyFor([{ role: "assistant", text: "x".repeat(2500), changes: [{}], state: "discarded" }])
  assert.ok(t.content.slice(0, 300).startsWith("[Proposal discarded, nothing applied]"))
})
