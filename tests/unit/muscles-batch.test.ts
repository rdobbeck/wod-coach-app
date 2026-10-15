import test from "node:test"
import assert from "node:assert/strict"
import { batchByTags } from "../../lib/muscles/batch"

const row = (id: string, name: string, primary: string[] = [], secondary: string[] = []) => ({ id, name, primary, secondary })

test("rows whose drafted tags match share one update, in first-seen order", () => {
  assert.deepEqual(batchByTags([row("a", "Back Squat"), row("b", "Hip Thrust"), row("c", "Front Squat")]), [
    { primary: ["glutes", "quads"], secondary: ["lower-back", "adductors"], ids: ["a", "c"] },
    { primary: ["glutes"], secondary: ["side-glutes", "hamstrings"], ids: ["b"] },
  ])
})

test("a row already carrying its draft is left alone", () => {
  assert.deepEqual(batchByTags([row("a", "Back Squat", ["glutes", "quads"], ["lower-back", "adductors"])]), [])
})

test("a row the rules no longer tag has its old draft cleared; an empty one stays as it is", () => {
  assert.deepEqual(batchByTags([row("a", "Air Bike", ["quads"]), row("b", "Row Erg")]), [{ primary: [], secondary: [], ids: ["a"] }])
})
