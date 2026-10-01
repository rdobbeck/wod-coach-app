/**
 * Group classes a coach teaches, from a JSON feed they point the app at.
 *
 * The feed is the shape ryan-classes publishes (github.com/rdobbeck/ryan-classes):
 *   { weeks: [{ weekOf, classes: [{ date: "2026-09-30", day: "Wed", start: "4:30 PM",
 *     end: "5:30 PM", title: "CrossFit", bookUrl? }] }], gym?: { name, scheduleUrl } }
 * Anything that doesn't fit is skipped rather than failing the page.
 */
export type GymClass = {
  date: string // YYYY-MM-DD, the gym's local day
  day: string
  start: string
  end: string | null
  title: string
  bookUrl: string | null
}

export type ClassFeed = {
  gym: { name: string | null; scheduleUrl: string | null }
  classes: GymClass[]
}

/** A feed address the server is willing to fetch: https, or http on this machine for tests. */
export function classFeedUrlOk(raw: string | null | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1"
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null
  return url.toString()
}

const httpsOnly = (raw: unknown) => {
  if (typeof raw !== "string") return null
  try {
    const u = new URL(raw)
    return u.protocol === "https:" ? u.toString() : null
  } catch {
    return null
  }
}

/** Turns whatever the feed returned into classes on or after `today` (YYYY-MM-DD), soonest first. */
export function upcomingClasses(raw: unknown, today: string): ClassFeed {
  const feed = (raw ?? {}) as { weeks?: unknown; gym?: { name?: unknown; scheduleUrl?: unknown } }
  const weeks = Array.isArray(feed.weeks) ? feed.weeks : []
  const classes: GymClass[] = []
  for (const w of weeks) {
    const rows = Array.isArray((w as { classes?: unknown })?.classes) ? ((w as { classes: unknown[] }).classes) : []
    for (const r of rows) {
      const c = r as Record<string, unknown>
      if (typeof c?.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(c.date) || c.date < today) continue
      if (typeof c.start !== "string" || !c.start.trim()) continue
      classes.push({
        date: c.date,
        day: typeof c.day === "string" ? c.day : "",
        start: c.start.trim(),
        end: typeof c.end === "string" && c.end.trim() ? c.end.trim() : null,
        title: typeof c.title === "string" && c.title.trim() ? c.title.trim() : "Class",
        bookUrl: httpsOnly(c.bookUrl),
      })
    }
  }
  classes.sort((a, b) => a.date.localeCompare(b.date) || toMinutes(a.start) - toMinutes(b.start))
  return {
    gym: { name: typeof feed.gym?.name === "string" ? feed.gym.name : null, scheduleUrl: httpsOnly(feed.gym?.scheduleUrl) },
    classes,
  }
}

/** "4:30 PM" -> 990, so classes on the same day sort by time. Unparseable times sort last. */
function toMinutes(t: string): number {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(t.trim())
  if (!m) return 24 * 60
  let h = Number(m[1]) % 12
  if (m[3]?.toLowerCase() === "pm") h += 12
  return h * 60 + Number(m[2] ?? 0)
}

/** Today's date in the gym's zone, as YYYY-MM-DD. */
export function todayIn(tz: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

/** "Wed, Oct 1" from a feed date, without the timezone drift of new Date("2026-10-01"). */
export function classDateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
}

/**
 * Fetches and filters the feed. Never throws: a dead or malformed feed is an
 * empty list, and the page shows that it has nothing to list.
 */
export async function loadClasses(feedUrl: string | null | undefined, tz: string): Promise<ClassFeed | null> {
  const url = classFeedUrlOk(feedUrl)
  if (!url) return null
  try {
    const res = await fetch(url, { next: { revalidate: 600 }, headers: { accept: "application/json" } })
    if (!res.ok) return { gym: { name: null, scheduleUrl: null }, classes: [] }
    return upcomingClasses(await res.json(), todayIn(tz))
  } catch {
    return { gym: { name: null, scheduleUrl: null }, classes: [] }
  }
}
