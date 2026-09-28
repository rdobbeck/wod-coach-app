/**
 * Timed exercises. A plank "3 x 60s" counts down to the target; a dead hang
 * "max hold" counts up until the client stops. Anything else is reps.
 *
 * The seconds a client held are stored in the set's reps column, so nothing
 * about storage or history changes; the player just labels the column "Sec".
 */
export type Hold = { mode: "down"; seconds: number } | { mode: "up"; seconds: null }

const MAX_WORDS = /\b(max(?:imum)?(?:\s+hold|\s+time|\s+effort)?|as long as (?:possible|you can)|amsap|for time held|to failure)\b/i

// A duration that isn't preceded by "rest": 30s, 45 sec, 90 seconds, 1 min, 1:00.
const DURATION = /(?<!rest\s{0,8})(?:(\d+):(\d{2})|(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds|m|min|mins|minutes)\b)/i

function withoutRest(text: string) {
  // Drop the rest clause so "3 x 60s hold, rest 90s" reads its own 60s, and
  // "3x8, rest 90 s" has no duration left at all.
  return text.replace(/rest[^,;)\n]*/gi, " ")
}

export function parseHold(e: { prescription: string | null | undefined; reps: string | null | undefined }): Hold | null {
  const sources = [e.reps, e.prescription].filter((s): s is string => !!s && !!s.trim())
  for (const raw of sources) {
    const text = withoutRest(raw)
    if (MAX_WORDS.test(text)) return { mode: "up", seconds: null }
    const m = text.match(DURATION)
    if (!m) continue
    const seconds =
      m[1] !== undefined ? Number(m[1]) * 60 + Number(m[2]) : Math.round(Number(m[3]) * (m[4].toLowerCase().startsWith("m") ? 60 : 1))
    if (seconds > 0) return { mode: "down", seconds: Math.min(seconds, 3600) }
  }
  return null
}
