import test from "node:test"
import assert from "node:assert/strict"
import { sanitizeMessages } from "../../lib/ai/thread"

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
