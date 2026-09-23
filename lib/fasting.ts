/** Intermittent fasting helpers shared by the client app and the coach view. */

export const PROTOCOLS: Record<string, { label: string; fastHours: number; windowHours: number }> = {
  "16:8": { label: "16:8", fastHours: 16, windowHours: 8 },
  "18:6": { label: "18:6", fastHours: 18, windowHours: 6 },
  "20:4": { label: "20:4", fastHours: 20, windowHours: 4 },
  OMAD: { label: "OMAD", fastHours: 23, windowHours: 1 },
  custom: { label: "Custom", fastHours: 16, windowHours: 8 },
}

export type FastEntry = { id: string; startedAt: string; endedAt: string | null; targetHours: number }

/** "20:00" -> minutes since midnight. */
export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

export const clockLabel = (hhmm: string) => {
  const mins = toMinutes(hhmm)
  const h = Math.floor(mins / 60)
  const suffix = h < 12 ? "am" : "pm"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${mins % 60 ? `:${String(mins % 60).padStart(2, "0")}` : ""}${suffix}`
}

/** Eating window as a number of hours, handling windows that cross midnight. */
export function windowHours(start: string, end: string) {
  const diff = (toMinutes(end) - toMinutes(start) + 1440) % 1440
  return Math.round((diff / 60) * 10) / 10
}

/** Is `now` (local) inside the eating window? Handles windows crossing midnight. */
export function inEatingWindow(now: Date, start: string, end: string) {
  const mins = now.getHours() * 60 + now.getMinutes()
  const s = toMinutes(start)
  const e = toMinutes(end)
  return s <= e ? mins >= s && mins < e : mins >= s || mins < e
}

/** Milliseconds until the eating window next opens or closes, from `now`. */
export function msUntil(now: Date, hhmm: string) {
  const target = new Date(now)
  target.setHours(Math.floor(toMinutes(hhmm) / 60), toMinutes(hhmm) % 60, 0, 0)
  if (target <= now) target.setDate(target.getDate() + 1)
  return target.getTime() - now.getTime()
}

export function formatDuration(ms: number) {
  const total = Math.max(Math.floor(ms / 1000), 0)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(s).padStart(2, "0")}s`
}

/** Completed fasts that hit their target, counted back from the most recent day. */
export function fastingStreak(fasts: FastEntry[]) {
  const hit = fasts
    .filter((f) => f.endedAt && (new Date(f.endedAt).getTime() - new Date(f.startedAt).getTime()) / 3_600_000 >= f.targetHours)
    .map((f) => new Date(f.endedAt!).toISOString().slice(0, 10))
  const days = Array.from(new Set(hit)).sort().reverse()
  if (!days.length) return 0
  let streak = 0
  const cursor = new Date(`${days[0]}T12:00:00Z`)
  for (const day of days) {
    if (day === cursor.toISOString().slice(0, 10)) {
      streak++
      cursor.setUTCDate(cursor.getUTCDate() - 1)
    } else break
  }
  return streak
}

export const fastHours = (f: FastEntry) =>
  ((f.endedAt ? new Date(f.endedAt).getTime() : Date.now()) - new Date(f.startedAt).getTime()) / 3_600_000
