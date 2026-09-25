import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { feedOwnerId, syncIfStale } from "@/lib/sessions/sync"

/**
 * Quietly bring the counter up to date. Called by the app in the background when
 * a page opens. It only reads the coach's calendar when the last read is over ten
 * minutes old, and it never reports an error to the person looking at the page.
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })

  const owner = await feedOwnerId()
  if (!owner) return NextResponse.json({ ok: false })
  const belongs =
    session.user.id === owner ||
    !!(await prisma.clientCoach.findFirst({ where: { clientId: session.user.id, coachId: owner }, select: { id: true } }))
  if (!belongs) return NextResponse.json({ ok: false })

  const r = await syncIfStale(owner)
  return NextResponse.json({ ok: r.ok, refreshed: r.ok && !("skipped" in r && r.skipped) })
}
