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

test("pages of the list: Next carries the last name shown", () => {
  const first = reviewList(rows, uses, { tab: "todo", pageSize: 2 })
  assert.deepEqual(first.rows.map((r) => r.id), ["sq2", "bike"])
  assert.equal(first.next, "bike")
  const second = reviewList(rows, uses, { tab: "todo", pageSize: 2, after: first.next })
  assert.deepEqual(second.rows.map((r) => r.id), ["pu"])
  assert.equal(second.next, null)
  assert.equal(second.total, 3)
  // A cursor that no longer exists starts from the top instead of showing nothing.
  assert.deepEqual(reviewList(rows, uses, { tab: "todo", pageSize: 2, after: "gone" }).rows.map((r) => r.id), ["sq2", "bike"])
})

test("confirming a page and pressing Next shows the next most-used names, not the ones after them", () => {
  const names = Array.from({ length: 150 }, (_, i) => row(`n${i + 1}`, `Exercise ${String(i + 1).padStart(3, "0")}`, ["quads"]))
  const used = new Map(names.map((r, i) => [r.id, 1000 - i]))
  const page1 = reviewList(names, used, { tab: "todo" })
  assert.deepEqual([page1.rows[0].id, page1.rows[49].id], ["n1", "n50"])
  assert.equal(page1.next, "n50") // the Next link carries a cursor, not a page number over a shrinking list
  // Ryan confirms all 50; the rows stay on screen, then he presses Next.
  const confirmed = names.map((r, i) => (i < 50 ? { ...r, musclesReviewedAt: new Date("2026-10-15T12:00:00Z") } : r))
  const page2 = reviewList(confirmed, used, { tab: "todo", after: page1.next })
  assert.deepEqual([page2.rows[0].id, page2.rows[49].id], ["n51", "n100"])
})

test("a name with a reviewed copy shows that copy, so Looks right keeps Ryan's answer", () => {
  const mixed = [row("old", "Hip Thrust", ["glutes"], ["hamstrings"], true), row("busy", "hip thrust", ["glutes"], ["side-glutes", "hamstrings"])]
  const out = reviewList(mixed, new Map([["old", 5], ["busy", 40]]), { tab: "todo" })
  assert.deepEqual(out.rows.map((r) => [r.id, r.secondary, r.uses, r.reviewed]), [["old", ["hamstrings"], 45, false]])
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
