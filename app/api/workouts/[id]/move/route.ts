import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canAccessClient, dayKey, fromDayKey } from "@/lib/training"

/**
 * Move a workout to another day. Body: { date: "YYYY-MM-DD", today?: "YYYY-MM-DD" }.
 * Clients may only move their own not-yet-completed workouts, only when their
 * coach allows it, and only to today or later (`today` is the client's local
 * date, so timezones don't block moving to "today"). Coaches can move freely.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { date, today } = (await req.json()) as { date?: string; today?: string }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 })
  }

  const workout = await prisma.workout.findUnique({
    where: { id: params.id },
    include: { client: { include: { clientProfile: true } } },
  })
  if (!workout?.clientId || !(await canAccessClient(session.user.id, workout.clientId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (session.user.id === workout.clientId && workout.programId) {
    const program = await prisma.program.findUnique({ where: { id: workout.programId }, select: { isDraft: true } })
    if (program?.isDraft) return NextResponse.json({ error: "Not found" }, { status: 404 }) // unpublished
  }
  if (workout.isCompleted) {
    return NextResponse.json({ error: "Completed workouts can't be moved" }, { status: 400 })
  }

  const isClient = session.user.id === workout.clientId
  if (isClient) {
    if (workout.client?.clientProfile && !workout.client.clientProfile.canMoveWorkouts) {
      return NextResponse.json({ error: "Your coach has turned off moving workouts" }, { status: 403 })
    }
    // Allow the client's "today" even if the server's UTC date is already tomorrow.
    const earliest = today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : dayKey(new Date(Date.now() - 86_400_000))
    if (date < earliest) {
      return NextResponse.json({ error: "Workouts can only be moved to today or later" }, { status: 400 })
    }
  }

  if (date === dayKey(workout.scheduledDate)) return NextResponse.json({ ok: true })

  const target = fromDayKey(date)
  const sameDay = await prisma.workout.count({ where: { clientId: workout.clientId, scheduledDate: target } })
  const updated = await prisma.workout.update({
    where: { id: workout.id },
    data: {
      scheduledDate: target,
      dayOfWeek: target.getUTCDay(),
      order: sameDay + 1, // lands after anything already on that day
      originalDate: workout.originalDate ?? workout.scheduledDate,
      movedAt: new Date(),
      movedById: session.user.id,
    },
  })
  return NextResponse.json({ ok: true, date: dayKey(updated.scheduledDate) })
}
