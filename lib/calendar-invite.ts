/**
 * "Schedule my session": turn a planned workout into an event for the client's
 * own calendar. Pure and browser safe (no Prisma), so the sheet, the .ics route
 * and the unit tests all share it.
 *
 * A plan is a local time of day plus the client's timezone, laid on the
 * workout's day. Events are written in UTC, so no VTIMEZONE block is needed.
 */

export type PlannedEvent = {
  id: string
  /** Workout day, YYYY-MM-DD. */
  day: string
  /** Local time of day, HH:MM (24h). */
  time: string
  minutes: number
  /** IANA timezone the time is in, e.g. America/Chicago. */
  tz: string
  title: string
  details: string
  url: string
}

export const DEFAULT_MINUTES = 60
export const REMINDER_MINUTES = 30
export const isTime = (t: unknown): t is string => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)
export const isTz = (tz: unknown): tz is string => {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Offset of `tz` from UTC at instant `at`, in minutes (Chicago in summer = -300). */
function offsetMinutes(at: Date, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  )
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return Math.round((asUtc - at.getTime()) / 60_000)
}

/** The instant a wall-clock time on a day happens in a timezone. */
export function zonedToUtc(day: string, time: string, tz: string): Date {
  const [y, m, d] = day.split("-").map(Number)
  const [hh, mm] = time.split(":").map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  // Two passes settle the offset either side of a daylight-saving change.
  let at = guess - offsetMinutes(new Date(guess), tz) * 60_000
  at = guess - offsetMinutes(new Date(at), tz) * 60_000
  return new Date(at)
}

export function eventTimes(e: Pick<PlannedEvent, "day" | "time" | "minutes" | "tz">) {
  const start = zonedToUtc(e.day, e.time, e.tz)
  return { start, end: new Date(start.getTime() + e.minutes * 60_000) }
}

/** 20261015T123000Z */
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")

/** RFC 5545 text: escape \ ; , and newlines. */
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")

/** Fold lines over 75 octets (continuation lines start with a space). */
function fold(line: string) {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let cur = ""
  let len = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (len + n > (out.length ? 74 : 75)) {
      out.push(cur)
      cur = ""
      len = 0
    }
    cur += ch
    len += n
  }
  out.push(cur)
  return out.join("\r\n ")
}

/**
 * One .ics with every event. The UID is fixed per workout, so calendars that
 * honour updates (Outlook, Google import) replace the old copy rather than
 * adding a second one.
 */
export function buildIcs(events: PlannedEvent[], now = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//wod.coach//Schedule my session//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"]
  for (const e of events) {
    const { start, end } = eventTimes(e)
    lines.push(
      "BEGIN:VEVENT",
      `UID:workout-${e.id}@wod.coach`,
      `DTSTAMP:${stamp(now)}`,
      `SEQUENCE:${Math.floor(now.getTime() / 1000)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${icsText(e.title)}`,
      `DESCRIPTION:${icsText(`${e.details}\n\nOpen it: ${e.url}`)}`,
      `URL:${e.url}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsText(e.title)}`,
      `TRIGGER:-PT${REMINDER_MINUTES}M`,
      "END:VALARM",
      "END:VEVENT",
    )
  }
  lines.push("END:VCALENDAR")
  return lines.map(fold).join("\r\n") + "\r\n"
}

/** Google Calendar's prefilled "new event" page. One event per link. */
export function googleCalendarUrl(e: PlannedEvent): string {
  const { start, end } = eventTimes(e)
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: `${e.details}\n\nOpen it: ${e.url}`,
    ctz: e.tz,
  })
  return `https://calendar.google.com/calendar/render?${q}`
}

/** Event title and body for a workout. */
export function eventCopy(name: string, exerciseNames: string[]) {
  const shown = exerciseNames.slice(0, 8)
  const more = exerciseNames.length - shown.length
  return {
    title: `Train: ${name}`,
    details: shown.length ? `${shown.join("\n")}${more > 0 ? `\n+ ${more} more` : ""}` : name,
  }
}

/** "07:30" -> "7:30 AM" */
export function timeLabel(time: string) {
  const [h, m] = time.split(":").map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`
}

/** Moved to another day after it went into their calendar, so the calendar copy is out of date. */
export const planIsStale = (plannedAt: Date | null, movedAt: Date | null) => !!plannedAt && !!movedAt && movedAt > plannedAt
