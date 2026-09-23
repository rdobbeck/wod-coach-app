import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withAlert } from "@/lib/alert"

/**
 * Client starts or ends a fast. Body: { action: "start" | "end", notes? }.
 * One open fast at a time: starting again just returns the open one, and
 * ending with nothing open is a no-op, so double taps can't create junk.
 */
async function handlePOST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "CLIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const profile = await prisma.clientProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile?.fastingEnabled) return NextResponse.json({ error: "Fasting isn't switched on for you" }, { status: 403 })

  const { action, notes } = (await req.json()) as { action?: string; notes?: string }
  const open = await prisma.fastLog.findFirst({ where: { userId: session.user.id, endedAt: null }, orderBy: { startedAt: "desc" } })

  if (action === "start") {
    const fast = open ?? (await prisma.fastLog.create({ data: { userId: session.user.id, startedAt: new Date(), targetHours: profile.fastingTargetHours } }))
    return NextResponse.json({ fast })
  }
  if (action === "end") {
    if (!open) return NextResponse.json({ fast: null })
    const fast = await prisma.fastLog.update({ where: { id: open.id }, data: { endedAt: new Date(), notes: notes?.trim() || null } })
    return NextResponse.json({ fast })
  }
  return NextResponse.json({ error: "action must be start or end" }, { status: 400 })
}

export const POST = withAlert("fasts", handlePOST)
