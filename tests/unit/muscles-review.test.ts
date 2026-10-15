import test from "node:test"
import assert from "node:assert/strict"
import { reviewList } from "../../lib/muscles/review"

const row = (id: string, name: string, primary: string[] = [], secondary: string[] = [], reviewed = false) => ({
  id,
  name,
  videoUrl: `https://youtu.be/${id}`,
  primaryMuscles: primary,
  secondaryMuscles: secondary,
  musclesReviewedAt: reviewed ? new Date("2026-10-14T12:00:00Z") : null,
})

const rows = [
  row("sq1", "Back Squat", ["glutes", "quads"]),
  row("sq2", "back squat", ["glutes", "quads"]),
  row("ht", "Hip Thrust", ["glutes"], ["hamstrings"], true),
  row("bike", "Air Bike"),
  row("pu", "Pull-Up", ["lats", "biceps"]),
]
const uses = new Map([["sq1", 5], ["sq2", 30], ["ht", 50], ["bike", 20], ["pu", 1]])

test("to review: unreviewed names, most used first; rows sharing a name are one entry with their uses added", () => {
  const out = reviewList(rows, uses, { tab: "todo" })
  assert.deepEqual(out.rows.map((r) => [r.id, r.uses]), [["sq2", 35], ["bike", 20], ["pu", 1]])
  assert.equal(out.total, 3)
})

test("the reviewed tab, and the no-tags tab (unreviewed names the rules left untagged)", () => {
  assert.deepEqual(reviewList(rows, uses, { tab: "reviewed" }).rows.map((r) => r.id), ["ht"])
  assert.deepEqual(reviewList(rows, uses, { tab: "untagged" }).rows.map((r) => r.id), ["bike"])
})

test("search narrows by name, ignoring case", () => {
  assert.deepEqual(reviewList(rows, uses, { tab: "todo", q: " SQUAT " }).rows.map((r) => r.id), ["sq2"])
})

test("progress counts the reviewed names among the most used", () => {
  // The two most used names are Hip Thrust (50, reviewed) and Back Squat (35, not).
  const out = reviewList(rows, uses, { tab: "todo", topN: 2 })
  assert.equal(out.reviewedOfTop, 1)
  assert.equal(out.topN, 2)
  assert.equal(reviewList(rows, uses, { tab: "todo" }).topN, 4) // fewer than 300 names: all of them
})

test("pages of the list", () => {
  const out = reviewList(rows, uses, { tab: "todo", page: 2, pageSize: 2 })
  assert.deepEqual(out.rows.map((r) => r.id), ["pu"])
  assert.equal(out.total, 3)
})

test("a name is reviewed only when every row with it is: a new duplicate puts it back in the queue", () => {
  const mixed = [row("old", "Hip Thrust", ["glutes"], ["hamstrings"], true), row("new", "hip thrust", ["glutes"], ["side-glutes", "hamstrings"])]
  const used = new Map([["old", 40]])
  // The most-used row still stands for the name, so the queue shows the answer Ryan already gave.
  assert.deepEqual(reviewList(mixed, used, { tab: "todo" }).rows.map((r) => [r.id, r.reviewed, r.secondary]), [["old", false, ["hamstrings"]]])
  assert.equal(reviewList(mixed, used, { tab: "reviewed" }).total, 0)
  assert.equal(reviewList(mixed, used, { tab: "todo", topN: 1 }).reviewedOfTop, 0)
})

test("an entry shows its row's tags in vocabulary order", () => {
  assert.deepEqual(reviewList([row("x", "Odd", ["quads", "glutes"], ["adductors"])], new Map(), { tab: "todo" }).rows, [
    { id: "x", name: "Odd", videoUrl: "https://youtu.be/x", primary: ["glutes", "quads"], secondary: ["adductors"], reviewed: false, uses: 0 },
  ])
})
