import test from "node:test"
import assert from "node:assert/strict"
import { rankForGroup } from "../../lib/muscles/rank"

const ex = (id: string, name: string, primary: string[], secondary: string[] = [], videoUrl: string | null = `https://youtu.be/${id}`) => ({
  id,
  name,
  videoUrl,
  primaryMuscles: primary,
  secondaryMuscles: secondary,
})

test("primary before secondary; within each, most used first, then by name", () => {
  const rows = [
    ex("rdl", "Romanian Deadlift", ["glutes", "hamstrings"], ["lower-back"]),
    ex("ht", "Hip Thrust", ["glutes"], ["hamstrings"]),
    ex("gb", "Glute Bridge", ["glutes"], ["hamstrings"]),
    ex("sq", "Back Squat", ["glutes", "quads"]),
    ex("lc", "Leg Curl", ["hamstrings"]),
  ]
  const uses = new Map([["rdl", 50], ["ht", 9], ["gb", 9], ["sq", 80], ["lc", 200]])
  assert.deepEqual(
    rankForGroup(rows, "hamstrings", uses).map((r) => [r.id, r.role]),
    [["lc", "primary"], ["rdl", "primary"], ["gb", "secondary"], ["ht", "secondary"]],
  )
})

test("rows sharing a name are one exercise: their uses add up and the most-used row stands for them", () => {
  const rows = [ex("a", "Back Squat", ["quads"]), ex("b", "back squat", ["quads"]), ex("c", "Front Squat", ["quads"])]
  const uses = new Map([["a", 3], ["b", 40], ["c", 42]])
  assert.deepEqual(rankForGroup(rows, "quads", uses).map((r) => r.id), ["b", "c"])
})

test("at most six, only exercises with a video, unused ones ordered by name", () => {
  const rows = Array.from({ length: 9 }, (_, i) => ex(`e${i}`, `Squat ${9 - i}`, ["quads"]))
  rows.push(ex("nv", "A Squat Without Video", ["quads"], [], null))
  const out = rankForGroup(rows, "quads", new Map())
  assert.deepEqual(out.map((r) => r.name), ["Squat 1", "Squat 2", "Squat 3", "Squat 4", "Squat 5", "Squat 6"])
})

test("each row carries what the player needs", () => {
  assert.deepEqual(rankForGroup([ex("x", "Calf Raise", ["calves"])], "calves", new Map()), [
    { id: "x", name: "Calf Raise", videoUrl: "https://youtu.be/x", role: "primary" },
  ])
})
