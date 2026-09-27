import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withAlert } from "@/lib/alert"
import { prisma } from "@/lib/prisma"
import { seal } from "@/lib/secret-box"
import { checkFeedUrl, fetchFeed, syncCalendar } from "@/lib/sessions/sync"

export const maxDuration = 60

const ZONES = new Set(Intl.supportedValuesOf("timeZone"))

/**
 * Connect the coach's calendar: { url, tz? }. The address is checked, read once
 * to prove it's a calendar, sealed, saved, and synced straight away. Removing it:
 * { url: "" }. Sessions already read stay; nothing new is read.
 */
async function handlePOST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { url?: string; tz?: string }
  const coachId = session.user.id

  if (body.url === "") {
    await prisma.coachProfile.update({ where: { userId: coachId }, data: { calendarIcsUrl: null } })
    return NextResponse.json({ ok: true, removed: true })
  }

  const checked = checkFeedUrl(body.url ?? "")
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 })
  const tz = body.tz && ZONES.has(body.tz) ? body.tz : null

  try {
    await fetchFeed(checked.url)
  } catch (e) {
    return NextResponse.json({ error: `Couldn't read that calendar: ${(e as Error).message} Check you copied the whole private address.` }, { status: 400 })
  }

  await prisma.coachProfile.update({ where: { userId: coachId }, data: { calendarIcsUrl: seal(checked.url), ...(tz ? { calendarTz: tz } : {}) } })
  try {
    return NextResponse.json({ ok: true, report: await syncCalendar(coachId) })
  } catch (e) {
    return NextResponse.json({ ok: true, report: null, warning: (e as Error).message })
  }
}

export const POST = withAlert("sessions/feed", handlePOST)
