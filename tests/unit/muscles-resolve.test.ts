import test from "node:test"
import assert from "node:assert/strict"
import { resolveMuscles, unlinkedNames } from "../../lib/muscles/resolve"

const lib = (name: string, primary: string[], secondary: string[] = []) => ({ name, primaryMuscles: primary, secondaryMuscles: secondary })

test("a linked row shows its library exercise's muscles, even when that exercise has none", () => {
  assert.deepEqual(resolveMuscles({ name: "RDL", exercise: lib("Romanian Deadlift", ["glutes", "hamstrings"], ["lower-back"]) }, []), {
    primary: ["glutes", "hamstrings"],
    secondary: ["lower-back"],
  })
  assert.deepEqual(resolveMuscles({ name: "Air Bike", exercise: lib("Air Bike", []) }, [lib("Air Bike", ["quads"])]), { primary: [], secondary: [] })
})

test("an unlinked row borrows the muscles of a library exercise whose name differs only by case or outer spaces", () => {
  assert.deepEqual(resolveMuscles({ name: " pull-up ", exercise: null }, [lib("Pull-Up", ["lats", "biceps"], ["upper-back"])]), {
    primary: ["lats", "biceps"],
    secondary: ["upper-back"],
  })
})

test("among same-name library rows the first tagged one wins; no tagged match means no chips", () => {
  assert.deepEqual(resolveMuscles({ name: "back squat", exercise: null }, [lib("Back Squat", []), lib("BACK SQUAT", ["glutes", "quads"])]), { primary: ["glutes", "quads"], secondary: [] })
  assert.deepEqual(resolveMuscles({ name: "Mystery Drill", exercise: null }, [lib("Pull-Up", ["lats"])]), { primary: [], secondary: [] })
  assert.deepEqual(resolveMuscles({ name: null, exercise: null }, []), { primary: [], secondary: [] })
})

test("names to look up: unlinked rows only, trimmed, each once ignoring case", () => {
  const rows = [
    { name: "Pull-Up", exercise: null },
    { name: " pull-up", exercise: null },
    { name: "Back Squat", exercise: lib("Back Squat", []) },
    { name: null, exercise: null },
    { name: "  ", exercise: null },
    { name: "Ring Row ", exercise: null },
  ]
  assert.deepEqual(unlinkedNames(rows), ["Pull-Up", "Ring Row"])
})
