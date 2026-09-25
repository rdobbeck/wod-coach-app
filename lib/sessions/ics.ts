/**
 * A small reader for the private iCal feed Google gives every calendar.
 *
 * It reads only what the session counter needs: id, title, start and end,
 * guest emails, and whether the event was cancelled. Timed events only;
 * all-day events are skipped. Repeating events are counted, not expanded.
 */
export type RawEvent = {
  uid: string // includes the recurrence id, so each instance is its own event
  title: string
  startsAt: Date
  endsAt: Date | null
  attendees: string[] // lowercase emails
  cancelled: boolean
  repeats: boolean
}

/** Undo the line folding iCal uses for long lines (a line break followed by a space or tab). */
const unfold = (text: string) => text.replace(/\r?\n[ \t]/g, "")

const unescapeText = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\;/g, ";").replace(/\\\\/g, "\\")

/** "DTSTART;TZID=America/Chicago:20260924T180000" -> name, params, value. */
function splitLine(line: string) {
  const i = line.indexOf(":")
  if (i < 0) return null
  const [name, ...params] = line.slice(0, i).split(";")
  const p: Record<string, string> = {}
  for (const x of params) {
    const [k, v] = x.split("=")
    if (k && v) p[k.toUpperCase()] = v
  }
  return { name: name.toUpperCase(), params: p, value: line.slice(i + 1) }
}

/** The UTC moment for a wall-clock time in an IANA time zone. */
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
  const at = (t: number) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]))
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  }
  // Shift by how far the zone's clock is from UTC at that moment, twice to settle across a DST change.
  let t = guess - (at(guess) - guess)
  t = guess - (at(t) - t)
  return new Date(t)
}

/** Parse an iCal date-time. Null for all-day values or anything unreadable. */
export function parseWhen(value: string, params: Record<string, string>, defaultTz: string): Date | null {
  if (params.VALUE === "DATE") return null
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/)
  if (!m) return null
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number)
  if (m[7] === "Z") return new Date(Date.UTC(y, mo - 1, d, h, mi, s))
  try {
    return zonedToUtc(y, mo, d, h, mi, s, params.TZID || defaultTz)
  } catch {
    return zonedToUtc(y, mo, d, h, mi, s, defaultTz)
  }
}

export function parseIcs(text: string, defaultTz = "America/Chicago"): RawEvent[] {
  const lines = unfold(text).split(/\r?\n/)
  const out: RawEvent[] = []
  let cur: Record<string, unknown> | null = null

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = { attendees: [] as string[] }
      continue
    }
    if (line === "END:VEVENT") {
      const e = cur
      cur = null
      if (!e || !e.uid || !(e.startsAt instanceof Date)) continue
      out.push({
        uid: `${e.uid}${e.recurrenceId ? `#${e.recurrenceId}` : ""}`,
        title: String(e.title ?? "").trim(),
        startsAt: e.startsAt,
        endsAt: (e.endsAt as Date) ?? null,
        attendees: e.attendees as string[],
        cancelled: e.status === "CANCELLED",
        repeats: !!e.repeats && !e.recurrenceId,
      })
      continue
    }
    if (!cur) continue
    const l = splitLine(line)
    if (!l) continue
    switch (l.name) {
      case "UID": cur.uid = l.value; break
      case "SUMMARY": cur.title = unescapeText(l.value); break
      case "STATUS": cur.status = l.value.toUpperCase(); break
      case "RRULE": cur.repeats = true; break
      case "RECURRENCE-ID": cur.recurrenceId = l.value; break
      case "DTSTART": cur.startsAt = parseWhen(l.value, l.params, defaultTz) ?? undefined; break
      case "DTEND": cur.endsAt = parseWhen(l.value, l.params, defaultTz); break
      case "ATTENDEE": {
        const m = l.value.match(/^mailto:(.+)$/i)
        if (m) (cur.attendees as string[]).push(m[1].trim().toLowerCase())
        break
      }
    }
  }
  return out
}
