import { test, expect } from "@playwright/test"
import { measureFor, parseTracking } from "../lib/hold"
import { parseRestSeconds } from "../lib/rest"
import { summarizeEntry } from "../lib/training-format"

/** In the work target a bare "m" is meters; in the rest clause every unit is time. */
test("distance targets track distance, not a hold", () => {
  expect(parseTracking({ prescription: "3x30m @ RPE 7.5, rest 60-90s", reps: "30m" })).toEqual({ kind: "distance", amount: 30, unit: "m" })
  expect(parseRestSeconds("3x30m @ RPE 7.5, rest 60-90s")).toBe(90)
  expect(parseTracking({ prescription: "400m run", reps: null })).toEqual({ kind: "distance", amount: 400, unit: "m" })
})

test("time targets stay timed", () => {
  expect(parseTracking({ prescription: "3x20s, rest 60s", reps: null })).toEqual({ kind: "timed", hold: { mode: "down", seconds: 20 } })
  expect(parseTracking({ prescription: "1 min plank", reps: null })).toEqual({ kind: "timed", hold: { mode: "down", seconds: 60 } })
  expect(parseTracking({ prescription: "3x45s farmer carry", reps: null, libraryTracking: "distance" })).toEqual({ kind: "timed", hold: { mode: "down", seconds: 45 } })
  expect(parseTracking({ prescription: "3 x 10'", reps: null })).toEqual({ kind: "timed", hold: { mode: "down", seconds: 600 } })
  expect(parseTracking({ prescription: "3 x :45", reps: null })).toEqual({ kind: "timed", hold: { mode: "down", seconds: 45 } })
})

test("rest 2m is two minutes", () => {
  expect(parseRestSeconds("3x8, rest 2m")).toBe(120)
  expect(parseTracking({ prescription: "3x8, rest 2m", reps: "8" })).toEqual({ kind: "reps" })
})

test("the library tag decides only when the target has no unit", () => {
  expect(parseTracking({ prescription: "3 x 2 lengths", reps: "2", libraryTracking: "distance" })).toEqual({ kind: "distance", amount: 2, unit: null })
  expect(parseTracking({ prescription: "3x5", reps: "5", libraryTracking: null })).toEqual({ kind: "reps" })
})

test("history reads weight × distance", () => {
  const sets = [1, 2, 3].map((n) => ({ setNumber: n, reps: 30, weight: 90, rpe: null }))
  expect(summarizeEntry({ resultText: null, rpe: null, sets }, "lb", { distance: "m" })).toBe("90 lb × 30 m (×3)")
})

test("cues after the target don't change it", () => {
  expect(parseTracking({ prescription: "3x6 reps; rest 90s\n\n5 second negatives", reps: null })).toEqual({ kind: "reps" })
  expect(parseTracking({ prescription: "3 x 8-10 reps\n\nrest 90s\n\nSub - side plank 1 minute", reps: null })).toEqual({ kind: "reps" })
  expect(parseTracking({ prescription: "@2011, 6 each side x 4 sets; rest 60s\n\nNote: hold 1 second, return.", reps: null })).toEqual({ kind: "reps" })
  expect(parseTracking({ prescription: "One set, Max Reps", reps: null })).toEqual({ kind: "reps" })
  expect(parseTracking({ prescription: "Ring Plank 2 x MAX (3:00 goal)", reps: null })).toEqual({ kind: "timed", hold: { mode: "up", seconds: null } })
})

test("each history entry carries its own unit", () => {
  const sets = [{ setNumber: 1, reps: 45, weight: 90, rpe: null }]
  expect(summarizeEntry({ resultText: null, rpe: null, sets, measure: "seconds" }, "lb")).toBe("90 lb × 45s")
  expect(summarizeEntry({ resultText: null, rpe: null, sets, measure: { distance: "m" } }, "lb")).toBe("90 lb × 45 m")
  expect(summarizeEntry({ resultText: null, rpe: null, sets }, "lb")).toBe("90 lb × 45")
  expect(measureFor({ prescription: "3x30m @ RPE 7.5", reps: "30m" })).toEqual({ distance: "m" })
  expect(measureFor({ prescription: "3 x 20s", reps: null })).toBe("seconds")
  expect(measureFor({ prescription: "3 x 2", reps: "2", libraryTracking: "distance" })).toEqual({ distance: null })
})
