/**
 * What a set measures, read from the coach's work target ("3 x 60s", "3x30m").
 *
 * - Timed: a plank "3 x 60s" counts down to the target; a dead hang "max hold"
 *   counts up until the client stops.
 * - Distance: a carry "3x30m" logs how far, in the unit the coach wrote.
 * - Anything else is reps.
 *
 * The unit in the work target decides. In the work target a bare "m" is meters;
 * minutes need min/mins/minute(s), an apostrophe (10') or a clock (30:00, :45).
 * The rest clause is dropped first, and rest is read by lib/rest.ts, where every
 * unit is time ("rest 2m" is two minutes). Only when the target has no unit at
 * all does the exercise library's tag decide (carries and sleds are distance).
 *
 * Seconds and distance are both stored in the set's reps column, so nothing
 * about storage or history changes; the player just labels the column.
 */
import type { SetMeasure } from "./training-format"

export type Hold = { mode: "down"; seconds: number } | { mode: "up"; seconds: null }
export type Tracking =
  | { kind: "reps" }
  | { kind: "timed"; hold: Hold }
  | { kind: "distance"; amount: number | null; unit: string | null }

const MAX_WORDS = /\b(max(?:imum)?(?:\s+hold|\s+time|\s+effort)?|as long as (?:possible|you can)|amsap|for time held|to failure)\b/i

const NUM = String.raw`(\d+(?:\.\d+)?)`
// 1:30, :45, 30s, 45 sec, 2 min, 10'. Not 10'' (seconds in some notations, and not minutes).
const TIME = new RegExp(
  String.raw`(\d+):(\d{2})\b|(?<![\d:]):(\d{2})\b|${NUM}\s*(s|secs?|seconds?|mins?|minutes?)\b|${NUM}\s*['’′](?!['’′])`,
  "i"
)
// "3 x 8-10 reps" is reps, whatever cue follows ("5 second negatives", "max reps").
const REPS = /\breps?\b/i
const DISTANCE = new RegExp(String.raw`${NUM}\s*(m|km|ft|yds?|mi|meters?|metres?|yards?|feet|miles?)\b`, "i")

// Spelled-out units shown the way coaches abbreviate them.
const SHORT_UNIT: Record<string, string> = { meter: "m", meters: "m", metre: "m", metres: "m", yard: "yd", yards: "yd", yds: "yd", foot: "ft", feet: "ft", mile: "mi", miles: "mi" }

/**
 * The work target alone. Imported prescriptions carry the coach's cues after
 * "Note:" ("hold 1 second, return"), which are not the target.
 * Then drop the rest clause so "3 x 60s hold, rest 90s" reads its own 60s, and
 * "3x8, rest 90 s" has no duration left at all.
 */
function workTarget(text: string) {
  return text.split(/\bnotes?:/i)[0].replace(/rest[^,;)\n]*/gi, " ")
}

function timeSeconds(m: RegExpMatchArray): number {
  if (m[1] !== undefined) return Number(m[1]) * 60 + Number(m[2])
  if (m[3] !== undefined) return Number(m[3])
  if (m[4] !== undefined) return Math.round(Number(m[4]) * (m[5].toLowerCase().startsWith("m") ? 60 : 1))
  return Math.round(Number(m[6]) * 60)
}

/**
 * The unit the work target names, if any; the earliest unit in the text wins.
 * "Reps" before any unit means reps. "Max" still means a count-up hold unless
 * a distance comes first, so "2 x MAX (3:00 goal)" counts up as it always has.
 */
function unitIn(text: string): Tracking | null {
  const t = text.match(TIME)
  const d = text.match(DISTANCE)
  const r = text.search(REPS)
  if (r >= 0 && (!t || r < t.index!) && (!d || r < d.index!)) return { kind: "reps" }
  if (d && (!t || d.index! < t.index!)) {
    const unit = d[2].toLowerCase()
    return { kind: "distance", amount: Number(d[1]), unit: SHORT_UNIT[unit] ?? unit }
  }
  if (MAX_WORDS.test(text)) return { kind: "timed", hold: { mode: "up", seconds: null } }
  if (t) {
    const seconds = timeSeconds(t)
    if (seconds > 0) return { kind: "timed", hold: { mode: "down", seconds: Math.min(seconds, 3600) } }
  }
  return null
}

export function parseTracking(e: {
  prescription: string | null | undefined
  reps: string | null | undefined
  /** The exercise library's tag ("distance" for carries and sleds), used only when the target has no unit. */
  libraryTracking?: string | null
}): Tracking {
  const sources = [e.reps, e.prescription].filter((s): s is string => !!s && !!s.trim()).map(workTarget)
  for (const text of sources) {
    const unit = unitIn(text)
    if (unit) return unit
  }
  if (e.libraryTracking === "distance") {
    // "3 x 2" on a sled: the bare number is the distance, unit unknown.
    const n = e.reps?.trim().match(/^\d+(?:\.\d+)?$/) ? Number(e.reps) : null
    return { kind: "distance", amount: n, unit: null }
  }
  return { kind: "reps" }
}

/** What a logged set's reps column holds for this exercise: reps, seconds, or a distance in the coach's unit. */
export function measureFor(e: { prescription: string | null | undefined; reps: string | null | undefined; libraryTracking?: string | null }): SetMeasure {
  const t = parseTracking(e)
  return t.kind === "timed" ? "seconds" : t.kind === "distance" ? { distance: t.unit } : "reps"
}

export function parseHold(e: { prescription: string | null | undefined; reps: string | null | undefined; libraryTracking?: string | null }): Hold | null {
  const t = parseTracking(e)
  return t.kind === "timed" ? t.hold : null
}
