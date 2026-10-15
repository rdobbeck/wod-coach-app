import test from "node:test"
import assert from "node:assert/strict"
import { validateMuscles } from "../../lib/muscles/validate"

test("valid lists come back in vocabulary order, each group once; empty lists are a valid answer", () => {
  assert.deepEqual(validateMuscles({ primary: ["hamstrings", "glutes", "glutes"], secondary: ["lower-back"] }), {
    ok: true,
    value: { primary: ["glutes", "hamstrings"], secondary: ["lower-back"] },
  })
  assert.deepEqual(validateMuscles({ primary: [], secondary: [] }), { ok: true, value: { primary: [], secondary: [] } })
})

test("an unknown group is refused by name", () => {
  assert.deepEqual(validateMuscles({ primary: ["quadriceps"], secondary: [] }), { ok: false, error: 'Unknown muscle group "quadriceps".' })
})

test("a group in both lists is refused by name", () => {
  assert.deepEqual(validateMuscles({ primary: ["glutes"], secondary: ["glutes"] }), { ok: false, error: `"glutes" can't be both primary and secondary.` })
})

test("anything but two lists of strings is refused", () => {
  for (const body of [null, "glutes", {}, { primary: "glutes", secondary: [] }, { primary: [], secondary: [3] }, { primary: [] }])
    assert.deepEqual(validateMuscles(body), { ok: false, error: "Send primary and secondary as lists of muscle groups." }, JSON.stringify(body))
})
