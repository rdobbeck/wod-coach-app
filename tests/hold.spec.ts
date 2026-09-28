import { test, expect } from "@playwright/test"
import { parseHold } from "../lib/hold"

/**
 * Timed exercises: a plank for 60s counts down, a max dead hang counts up.
 * Anything without a duration is an ordinary reps exercise.
 */
test("prescribed holds count down to the target", () => {
  expect(parseHold({ prescription: "3 x 30s", reps: null })).toEqual({ mode: "down", seconds: 30 })
  expect(parseHold({ prescription: "3x45 sec", reps: null })).toEqual({ mode: "down", seconds: 45 })
  expect(parseHold({ prescription: "Plank 3 x 1:00", reps: null })).toEqual({ mode: "down", seconds: 60 })
  expect(parseHold({ prescription: "3 x 60s hold, rest 90s", reps: null })).toEqual({ mode: "down", seconds: 60 })
  expect(parseHold({ prescription: "2 x 1 min", reps: null })).toEqual({ mode: "down", seconds: 60 })
  expect(parseHold({ prescription: "3 x 90 seconds", reps: null })).toEqual({ mode: "down", seconds: 90 })
})

test("the reps field can carry the duration on its own", () => {
  expect(parseHold({ prescription: null, reps: "30s" })).toEqual({ mode: "down", seconds: 30 })
  expect(parseHold({ prescription: null, reps: "1:00" })).toEqual({ mode: "down", seconds: 60 })
  expect(parseHold({ prescription: null, reps: "45 sec" })).toEqual({ mode: "down", seconds: 45 })
})

test("max-effort holds count up", () => {
  expect(parseHold({ prescription: "Dead hang, max hold", reps: null })).toEqual({ mode: "up", seconds: null })
  expect(parseHold({ prescription: "3 x as long as possible", reps: null })).toEqual({ mode: "up", seconds: null })
  expect(parseHold({ prescription: "2 x AMSAP", reps: null })).toEqual({ mode: "up", seconds: null })
  expect(parseHold({ prescription: null, reps: "max" })).toEqual({ mode: "up", seconds: null })
  expect(parseHold({ prescription: "Hollow hold 3 x max, rest 60s", reps: null })).toEqual({ mode: "up", seconds: null })
})

test("rest time is not a hold", () => {
  expect(parseHold({ prescription: "3x8, rest 90 s", reps: null })).toBeNull()
  expect(parseHold({ prescription: "3x5 @ RPE 7, rest 2 min", reps: "5" })).toBeNull()
  expect(parseHold({ prescription: "4x6 rest 60s between sets", reps: null })).toBeNull()
})

test("ordinary reps exercises are not timed", () => {
  expect(parseHold({ prescription: "3x8", reps: "8" })).toBeNull()
  expect(parseHold({ prescription: "5 x 5 @ 80%", reps: null })).toBeNull()
  expect(parseHold({ prescription: "AMRAP 10", reps: "AMRAP" })).toBeNull() // reps for time, not a hold
  expect(parseHold({ prescription: "8-12 reps", reps: "8-12" })).toBeNull()
  expect(parseHold({ prescription: null, reps: null })).toBeNull()
})
