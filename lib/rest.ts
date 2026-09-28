/**
 * Rest length from a coach's prescription text, e.g.
 * "4x6 @ RPE 7, rest 2-3 min" -> 180s, "3x8, rest 90 s" -> 90s, "rest 1:30" -> 90s.
 * Ranges take the longer end. Returns null when the text says nothing about rest.
 */
export function parseRestSeconds(prescription: string | null | undefined): number | null {
  if (!prescription) return null
  // After "rest": a clock (1:30), or a number (maybe decimal, maybe a range) with an optional unit.
  const m = prescription.match(
    /rest[^0-9]{0,8}(?:(\d+):(\d{2})|(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?\s*(s|sec|secs|seconds|m|min|mins|minutes)?)/i
  )
  if (!m) return null
  let seconds: number
  if (m[1] !== undefined) {
    seconds = Number(m[1]) * 60 + Number(m[2])
  } else {
    const value = Number(m[4] ?? m[3])
    if (!Number.isFinite(value) || value <= 0) return null
    const unit = (m[5] ?? "").toLowerCase()
    seconds = unit.startsWith("m") ? value * 60 : value
  }
  return Math.min(Math.max(Math.round(seconds), 5), 900)
}

/**
 * The rest the client actually gets. The text wins because the AI assistant
 * edits only the text, so it is the freshest; then the coach's rest field on
 * the exercise; then their account default.
 */
export function restSecondsFor(
  e: { prescription: string | null | undefined; restSeconds: number | null | undefined },
  defaultSeconds: number
): number {
  return parseRestSeconds(e.prescription) ?? (e.restSeconds && e.restSeconds > 0 ? e.restSeconds : null) ?? defaultSeconds
}

export const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.max(seconds, 0) % 60).padStart(2, "0")}`
