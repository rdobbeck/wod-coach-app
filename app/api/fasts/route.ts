import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withAlert } from "@/lib/alert"

const MAX_BACKDATE_MS = 24 * 3_600_000

/** A fast can start now or any time in the last day; the clock skew allowance covers a phone a minute ahead. */
function parseStart(v: unknown, now: Date): Date | null {
  if (typeof v !== "string") return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  if (d.getTime() > now.getTime() + 60_000 || d.getTime() < now.getTime() - MAX_BACKDATE_MS) return null
  return d
}

/**
 * Client starts, adjusts or ends a fast.
 * Body: { action: "start" | "adjust" | "end", startedAt?, notes? }.
 * One open fast at a time: starting again just returns the open one, and
 * ending with nothing open is a no-op, so double taps can't create junk.
 * `startedAt` lets them say when they really stopped eating, so the target
 * counts from then rather than from the tap.
 */
async function handlePOST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "CLIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const profile = await prisma.clientProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile?.fastingEnabled) return NextResponse.json({ error: "Fasting isn't switched on for you" }, { status: 403 })

  const { action, notes, startedAt } = (await req.json()) as { action?: string; notes?: string; startedAt?: string }
  const now = new Date()
  const open = await prisma.fastLog.findFirst({ where: { userId: session.user.id, endedAt: null }, orderBy: { startedAt: "desc" } })

  if (action === "start") {
    if (open) return NextResponse.json({ fast: open })
    const start = startedAt === undefined ? now : parseStart(startedAt, now)
    if (!start) return NextResponse.json({ error: "Start time must be within the last 24 hours" }, { status: 400 })
    const fast = await prisma.fastLog.create({ data: { userId: session.user.id, startedAt: start, targetHours: profile.fastingTargetHours } })
    return NextResponse.json({ fast })
  }
  if (action === "adjust") {
    if (!open) return NextResponse.json({ error: "No fast is running" }, { status: 404 })
    const start = parseStart(startedAt, now)
    if (!start) return NextResponse.json({ error: "Start time must be within the last 24 hours" }, { status: 400 })
    const fast = await prisma.fastLog.update({ where: { id: open.id }, data: { startedAt: start } })
    return NextResponse.json({ fast })
  }
  if (action === "end") {
    if (!open) return NextResponse.json({ fast: null })
    const fast = await prisma.fastLog.update({ where: { id: open.id }, data: { endedAt: new Date(), notes: notes?.trim() || null } })
    return NextResponse.json({ fast })
  }
  return NextResponse.json({ error: "action must be start, adjust or end" }, { status: 400 })
}

export const POST = withAlert("fasts", handlePOST)
