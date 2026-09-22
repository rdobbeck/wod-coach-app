/**
 * Rest length from a coach's prescription text, e.g.
 * "4x6 @ RPE 7, rest 2-3 min" -> 180s, "3x8, rest 90 s" -> 90s.
 * Ranges take the longer end. Returns null when the text says nothing about rest.
 */
export function parseRestSeconds(prescription: string | null | undefined): number | null {
  if (!prescription) return null
  const m = prescription.match(/rest[^0-9]{0,8}(\d+)(?:\s*[-–]\s*(\d+))?\s*(s|sec|secs|seconds|m|min|mins|minutes)?/i)
  if (!m) return null
  const value = Number(m[2] ?? m[1])
  if (!Number.isFinite(value) || value <= 0) return null
  const unit = (m[3] ?? "").toLowerCase()
  const seconds = unit.startsWith("m") ? value * 60 : value
  return Math.min(Math.max(Math.round(seconds), 5), 900)
}

export const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.max(seconds, 0) % 60).padStart(2, "0")}`
