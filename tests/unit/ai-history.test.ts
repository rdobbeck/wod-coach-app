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
      "Added a swim session for today. [These changes were discarded. Nothing was applied.]",
      "Swap Monday's raise",
      "Swapped it. [These changes were applied.]",
      "Bumped squats. [These changes were applied, then undone.]",
      "Here is a change. [These changes are waiting for review and have not been applied.]",
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
