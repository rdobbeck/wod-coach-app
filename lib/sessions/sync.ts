import { prisma } from "@/lib/prisma"
import { open } from "@/lib/secret-box"
import { parseIcs } from "./ics"
import { matchEvent } from "./match"
import { parseTitle } from "./title"

/**
 * Reads a coach's private calendar feed and keeps the sessions in it.
 *
 * Each coach pastes their calendar's private iCal address on Sessions; it's stored
 * sealed on CoachProfile.calendarIcsUrl (a secret: anyone with it can read the
 * calendar). The original single-coach setup still works as a fallback for that coach:
 *   GCAL_ICS_URL      the owner coach's feed
 *   GCAL_OWNER_EMAIL  which coach that is; defaults to the coach with the most clients
 *   GCAL_TZ           time zone for times without one; defaults to America/Chicago
 *
 * Read only. An event is kept if it matches a client or looks like a session;
 * everything else on the calendar is dropped and never stored. Whatever the coach
 * assigned or ignored by hand is left as they set it.
 */
export type SyncReport = {
  fetched: number
  kept: number
  matched: number
  needsReview: number
  dropped: number
  removed: number
  recurringSkipped: number
}

export class NotConfigured extends Error {
  constructor() {
    super("Your calendar isn't connected yet. Paste its private address on Sessions.")
  }
}

const DAY = 86_400_000
const BACK = 180 * DAY
const AHEAD = 180 * DAY

/** The feed and time zone for this coach, or null. Never leaves the server. */
async function feedFor(coachId: string): Promise<{ url: string; tz: string } | null> {
  const p = await prisma.coachProfile.findUnique({ where: { userId: coachId }, select: { calendarIcsUrl: true, calendarTz: true } })
  const tz = p?.calendarTz || process.env.GCAL_TZ || "America/Chicago"
  if (p?.calendarIcsUrl) return { url: open(p.calendarIcsUrl), tz }
  if (process.env.GCAL_ICS_URL && (await feedOwnerId()) === coachId) return { url: process.env.GCAL_ICS_URL, tz }
  return null
}

export const feedConfigured = async (coachId: string) => !!(await feedFor(coachId))

/** How the coach's calendar is connected, for the Sessions page. */
export async function feedStatus(coachId: string): Promise<{ source: "coach" | "server" | null; hint: string | null; tz: string | null }> {
  const p = await prisma.coachProfile.findUnique({ where: { userId: coachId }, select: { calendarIcsUrl: true, calendarTz: true } })
  if (p?.calendarIcsUrl) return { source: "coach", hint: calendarHost(open(p.calendarIcsUrl)), tz: p.calendarTz }
  if (process.env.GCAL_ICS_URL && (await feedOwnerId()) === coachId) return { source: "server", hint: calendarHost(process.env.GCAL_ICS_URL), tz: null }
  return { source: null, hint: null, tz: null }
}

// Only real calendar services, so the server never fetches an arbitrary address.
const CALENDAR_HOSTS = [/^calendar\.google\.com$/, /^p\d+-caldav\.icloud\.com$/, /^outlook\.(office365|live|office)\.com$/]

const calendarHost = (url: string) => {
  try {
    const h = new URL(url).hostname
    return h.includes("google") ? "Google Calendar" : h.includes("icloud") ? "Apple Calendar" : h.includes("outlook") ? "Outlook" : h
  } catch {
    return null
  }
}

/** Normalizes a pasted address, or explains what's wrong with it. */
export function checkFeedUrl(raw: string): { url: string } | { error: string } {
  const text = raw.trim().replace(/^webcal:\/\//i, "https://")
  let u: URL
  try {
    u = new URL(text)
  } catch {
    return { error: "That isn't a web address. Copy the whole private address from your calendar's settings." }
  }
  if (u.protocol !== "https:") return { error: "Use the address that starts with https:// (or webcal://)." }
  if (!CALENDAR_HOSTS.some((re) => re.test(u.hostname))) {
    return { error: "Use the private address from Google Calendar, Apple (iCloud) Calendar or Outlook." }
  }
  if (u.hostname === "calendar.google.com" && !u.pathname.includes("/private-")) {
    return { error: "That's the public address. Use the Secret address in iCal format, which has /private- in it." }
  }
  return { url: u.toString() }
}

/** The coach whose calendar this is. */
export async function feedOwnerId() {
  const email = process.env.GCAL_OWNER_EMAIL?.trim()
  if (email) return (await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, role: "COACH" }, select: { id: true } }))?.id ?? null
  const top = await prisma.clientCoach.groupBy({ by: ["coachId"], _count: { _all: true }, orderBy: { _count: { coachId: "desc" } }, take: 1 })
  return top[0]?.coachId ?? null
}

export async function fetchFeed(url: string) {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(25_000) })
  if (!res.ok) throw new Error(`The calendar feed answered ${res.status}.`)
  const text = await res.text()
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("The calendar feed did not look like a calendar.")
  return text
}

export async function syncCalendar(coachId: string, opts: { icsText?: string; now?: Date } = {}): Promise<SyncReport> {
  const now = opts.now ?? new Date()
  try {
    const feed = opts.icsText ? null : await feedFor(coachId)
    if (!opts.icsText && !feed) throw new NotConfigured()
    const text = opts.icsText ?? (await fetchFeed(feed!.url))
    const parsed = parseIcs(text, feed?.tz || process.env.GCAL_TZ || "America/Chicago")
    const from = new Date(now.getTime() - BACK)
    const to = new Date(now.getTime() + AHEAD)

    const [links, aliases, existing] = await Promise.all([
      prisma.clientCoach.findMany({ where: { coachId }, select: { client: { select: { id: true, name: true, email: true } } } }),
      prisma.clientAlias.findMany({ where: { coachId }, select: { clientId: true, alias: true } }),
      prisma.sessionEvent.findMany({ where: { coachId, startsAt: { gte: from, lte: to } } }),
    ])
    const clients = links.map((l) => l.client).filter((c) => c.id !== coachId)

    // A feed with nothing in it, when we already hold sessions, is a broken feed, not an empty calendar.
    if (!parsed.length && existing.length) throw new Error("The calendar feed came back empty, so nothing was changed.")

    const known = new Map(existing.map((e) => [e.uid, e]))
    const seen = new Set<string>()
    const report: SyncReport = { fetched: parsed.length, kept: 0, matched: 0, needsReview: 0, dropped: 0, removed: 0, recurringSkipped: 0 }

    for (const ev of parsed) {
      if (ev.startsAt < from || ev.startsAt > to || ev.cancelled) continue
      const info = parseTitle(ev.title)
      const match = matchEvent(ev, clients, aliases)
      if (!match.clientIds.length && !info.looksLikeSession) {
        report.dropped++
        continue
      }
      if (ev.repeats) {
        report.recurringSkipped++
        continue
      }
      const prior = known.get(ev.uid)
      const sticky = prior?.matchedBy === "manual" || prior?.matchedBy === "ignored"
      seen.add(ev.uid)
      const data = {
        title: ev.title,
        startsAt: ev.startsAt,
        endsAt: ev.endsAt,
        packageIndex: info.index,
        packageSize: info.size,
        needsPayment: info.needsPayment,
        syncedAt: now,
        ...(sticky ? {} : { clientIds: match.clientIds, matchedBy: match.by }),
      }
      await prisma.sessionEvent.upsert({
        where: { coachId_uid: { coachId, uid: ev.uid } },
        create: { coachId, uid: ev.uid, clientIds: match.clientIds, matchedBy: match.by, ...data },
        update: data,
      })
      report.kept++
      const clientIds = sticky ? prior!.clientIds : match.clientIds
      if (prior?.matchedBy === "ignored") continue
      if (clientIds.length) report.matched++
      else report.needsReview++
    }

    // Sessions we hold that are no longer on the calendar were deleted or moved out of range.
    const gone = existing.filter((e) => !seen.has(e.uid)).map((e) => e.id)
    if (gone.length) await prisma.sessionEvent.deleteMany({ where: { id: { in: gone } } })
    report.removed = gone.length

    await prisma.sessionSyncState.upsert({
      where: { coachId },
      create: { coachId, lastSyncAt: now, lastReport: report as never, lastError: null },
      update: { lastSyncAt: now, lastReport: report as never, lastError: null },
    })
    return report
  } catch (e) {
    const message = (e as Error).message
    await prisma.sessionSyncState.upsert({
      where: { coachId },
      create: { coachId, lastError: message },
      update: { lastError: message },
    })
    throw e
  }
}

/** Sync if the last one is older than maxAgeMs. Never throws: a stale counter beats a broken page. */
export async function syncIfStale(coachId: string, maxAgeMs = 10 * 60_000) {
  if (!(await feedConfigured(coachId))) return { ok: false as const, reason: "not configured" }
  const state = await prisma.sessionSyncState.findUnique({ where: { coachId } })
  if (state?.lastSyncAt && Date.now() - state.lastSyncAt.getTime() < maxAgeMs) return { ok: true as const, skipped: true }
  try {
    return { ok: true as const, skipped: false, report: await syncCalendar(coachId) }
  } catch (e) {
    return { ok: false as const, reason: (e as Error).message }
  }
}
