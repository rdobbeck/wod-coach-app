import { test, expect } from "@playwright/test"
import { rankExercises } from "../lib/exercise-search"

const v = "https://youtu.be/x"
const row = (name: string, videoUrl: string | null = v) => ({ name, videoUrl })

/** The real bug: 40 alphabetically earlier names used to push the exact match out. */
test("exact name wins even when many earlier names match", () => {
  const rows = [
    ...Array.from({ length: 60 }, (_, i) => row(`Axle Bar Front Rack Squat ${i}`)),
    row("Front Rack Squat to Box"),
    row("Kneeling Front Squat"),
    row("Front Squat"),
  ]
  expect(rankExercises("front squat", rows)[0].name).toBe("Front Squat")
})

test("starts-with, then phrase, then scattered words", () => {
  const rows = [row("Front Rack Back Squat"), row("Paused Front Squat"), row("Front Squat (Catalyst)"), row("Front Squat")]
  expect(rankExercises("Front Squat", rows).map((r) => r.name)).toEqual([
    "Front Squat",
    "Front Squat (Catalyst)",
    "Paused Front Squat",
    "Front Rack Back Squat",
  ])
})

test("within a tier, a video beats none, then shorter names", () => {
  const rows = [row("Back Squat to Box", null), row("Back Squat Pause Long Name"), row("Back Squat Pause")]
  expect(rankExercises("back squat", rows).map((r) => r.name)).toEqual(["Back Squat Pause", "Back Squat Pause Long Name", "Back Squat to Box"])
})

test("case and extra spaces don't matter, and the list is capped", () => {
  const rows = Array.from({ length: 30 }, (_, i) => row(`Front Squat ${i}`))
  expect(rankExercises("  FRONT   squat ", [...rows, row("front squat")])[0].name).toBe("front squat")
  expect(rankExercises("front squat", rows)).toHaveLength(20)
})
