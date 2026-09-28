import { test, expect } from "@playwright/test"
import { parseRestSeconds, restSecondsFor } from "../lib/rest"

/** Rest length from a prescription, the way coaches actually write it. */
test("units and phrasing coaches use", () => {
  expect(parseRestSeconds("3x8, rest 90 s")).toBe(90)
  expect(parseRestSeconds("3x5 @ RPE 7, rest 2 min")).toBe(120)
  expect(parseRestSeconds("Rest 45 seconds")).toBe(45)
  expect(parseRestSeconds("3x10 (rest 2min)")).toBe(120)
  expect(parseRestSeconds("4x6 rest 60s between sets")).toBe(60)
  expect(parseRestSeconds("rest 90")).toBe(90) // bare number means seconds
})

test("clock and decimal formats", () => {
  expect(parseRestSeconds("rest 2:00")).toBe(120)
  expect(parseRestSeconds("rest 1:30")).toBe(90)
  expect(parseRestSeconds("rest 0:45")).toBe(45)
  expect(parseRestSeconds("rest 1.5 min")).toBe(90)
  expect(parseRestSeconds("rest 2.5min")).toBe(150)
})

test("ranges take the longer end", () => {
  expect(parseRestSeconds("rest 2-3 min")).toBe(180)
  expect(parseRestSeconds("rest 60–90s")).toBe(90)
})

test("nothing about rest means null, not a guess", () => {
  expect(parseRestSeconds("3x8")).toBeNull()
  expect(parseRestSeconds("3 x 30s")).toBeNull() // that's a hold, not a rest
  expect(parseRestSeconds("rest as needed")).toBeNull()
  expect(parseRestSeconds(null)).toBeNull()
})

test("the rest actually used: text, then the coach's rest field, then their default", () => {
  expect(restSecondsFor({ prescription: "3x8, rest 2 min", restSeconds: 60 }, 90)).toBe(120)
  expect(restSecondsFor({ prescription: "3x8", restSeconds: 60 }, 90)).toBe(60)
  expect(restSecondsFor({ prescription: "3x8", restSeconds: null }, 90)).toBe(90)
  expect(restSecondsFor({ prescription: null, restSeconds: null }, 75)).toBe(75)
})
