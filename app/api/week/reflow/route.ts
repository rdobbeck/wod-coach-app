import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withAlert } from "@/lib/alert"
import { canAccessClient, clientVisible, dayKey, fromDayKey } from "@/lib/training"
import { planReflow, weekDays, type Movable } from "@/lib/reflow"
import { notifyUser } from "@/lib/notify"

/**
 * Reshape a week around the days a client can actually train.
 *
 * Body: { days: ["YYYY-MM-DD", ...], clientId?, dryRun? }. The days are the
 * ones they picked; everything they have not done yet that week spreads across
 * them, keeping the coach's order. Same rules as moving one workout: not
 * completed, not a draft, and for a client, only their own days from today on.
 */
async function handlePOST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { days, clientId, today, dryRun } = (await req.json()) as {
    days?: string[]
    clientId?: string
    today?: string
    dryRun?: boolean
  }

  const targetId = session.user.role === "COACH" ? clientId : session.user.id
  if (!targetId || !(await canAccessClient(session.user.id, targetId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const picked = Array.from(new Set((days ?? []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))).sort()
  if (!picked.length) return NextResponse.json({ error: "Pick at least one day" }, { status: 400 })
  if (picked.length > 7) return NextResponse.json({ error: "That's more than a week" }, { status: 400 })

  const isClient = session.user.id === targetId
  if (isClient) {
    const profile = await prisma.clientProfile.findUnique({
      where: { userId: targetId },
      select: { canMoveWorkouts: true },
    })
    if (profile && !profile.canMoveWorkouts) {
      return NextResponse.json({ error: "Your coach has turned off moving workouts" }, { status: 403 })
    }
    const earliest = today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : dayKey(new Date(Date.now() - 86_400_000))
    if (picked.some((d) => d < earliest)) {
      return NextResponse.json({ error: "Days in the past can't be used" }, { status: 400 })
    }
  }

  // Everything still to do in that whole week is in play, not just what falls
  // between the chosen days: a session missed on Monday gets swept forward, and
  // one sitting on Friday gets pulled back when Friday is no longer possible.
  const week = weekDays(fromDayKey(picked[0]))
  const span = { gte: fromDayKey(week[0]), lte: fromDayKey(week[6]) }

  const rows = await prisma.workout.findMany({
    where: {
      clientId: targetId,
      isCompleted: false,
      scheduledDate: span,
      ...(isClient ? clientVisible : {}),
    },
    orderBy: [{ scheduledDate: "asc" }, { order: "asc" }],
    include: { _count: { select: { exercises: true } } },
  })

  // A rest day is not a session to reschedule; it is the absence of one.
  const sessions: Movable[] = rows
    .filter((w) => w._count.exercises > 0)
    .map((w) => ({ id: w.id, day: dayKey(w.scheduledDate), name: w.name }))

  const moves = planReflow(sessions, picked)
  if (dryRun) return NextResponse.json({ sessions: sessions.length, moves })
  if (!moves.length) return NextResponse.json({ ok: true, moved: 0, moves: [] })

  const now = new Date()
  const byId = new Map(rows.map((w) => [w.id, w]))
  const perDay = new Map<string, number>()

  await prisma.$transaction(
    moves.map((m) => {
      const w = byId.get(m.id)!
      const target = fromDayKey(m.to)
      const n = (perDay.get(m.to) ?? 0) + 1
      perDay.set(m.to, n)
      return prisma.workout.update({
        where: { id: m.id },
        data: {
          scheduledDate: target,
          dayOfWeek: target.getUTCDay(),
          order: n,
          originalDate: w.originalDate ?? w.scheduledDate,
          movedAt: now,
          movedById: session.user.id,
        },
      })
    })
  )

  // The coach should hear about a reshaped week without having to go looking.
  if (isClient) {
    const coaches = await prisma.clientCoach.findMany({
      where: { clientId: targetId, status: "ACTIVE" },
      select: { coachId: true },
    })
    const name = session.user.name ?? session.user.email ?? "A client"
    await Promise.all(
      coaches.map((c) =>
        notifyUser(c.coachId, {
          title: "Week rescheduled",
          body: `${name} moved ${moves.length} ${moves.length === 1 ? "session" : "sessions"} to ${picked.length} ${picked.length === 1 ? "day" : "days"}.`,
          url: `/coach/clients/${targetId}`,
          tag: `reflow-${targetId}`,
        })
      )
    )
  }

  return NextResponse.json({ ok: true, moved: moves.length, moves })
}

export const POST = withAlert("week/reflow", handlePOST)
