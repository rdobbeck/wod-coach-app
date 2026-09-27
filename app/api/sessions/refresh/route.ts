import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { syncIfStale } from "@/lib/sessions/sync"

/**
 * Quietly bring the counter up to date. Called by the app in the background when
 * a page opens. It only reads the coach's calendar when the last read is over ten
 * minutes old, and it never reports an error to the person looking at the page.
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })

  // A coach refreshes their own calendar; a client refreshes their coach's.
  const coachId =
    session.user.role === "COACH"
      ? session.user.id
      : (await prisma.clientCoach.findFirst({ where: { clientId: session.user.id, status: "ACTIVE" }, select: { coachId: true } }))?.coachId
  if (!coachId) return NextResponse.json({ ok: false })

  const r = await syncIfStale(coachId)
  return NextResponse.json({ ok: r.ok, refreshed: r.ok && !("skipped" in r && r.skipped) })
}
