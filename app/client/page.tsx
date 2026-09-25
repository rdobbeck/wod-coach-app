import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { clientVisible, dayKey } from "@/lib/training"
import { bookingFor } from "@/lib/booking"
import { callCreditsFor } from "@/lib/call-credits"
import { counterForClient } from "@/lib/sessions/queries"
import TodayView, { type DayWorkout } from "@/components/client/TodayView"
import Tour from "@/components/client/Tour"

const DAY = 86_400_000

export default async function ClientToday() {
  const session = (await getServerSession(authOptions))!
  const now = Date.now()
  const [workouts, profile, coachLink, note, fasts, compliance] = await Promise.all([
    prisma.workout.findMany({
      where: {
        clientId: session.user.id,
        // Three weeks back, twelve ahead: what the week pager on Today can reach.
        scheduledDate: { gte: new Date(now - 21 * DAY), lte: new Date(now + 84 * DAY) },
        ...clientVisible,
      },
      orderBy: [{ scheduledDate: "asc" }, { order: "asc" }],
      include: {
        program: { select: { name: true, startDate: true } },
        exercises: { orderBy: { order: "asc" }, select: { name: true, exercise: { select: { name: true } } } },
      },
    }),
    prisma.clientProfile.findUnique({ where: { userId: session.user.id } }),
    prisma.clientCoach.findFirst({
      where: { clientId: session.user.id, status: "ACTIVE" },
      include: { coach: { select: { name: true, coachProfile: { select: { bookingUrl: true } } } } },
    }),
    // Most recent coach comment on any of this client's workouts.
    prisma.workoutComment.findFirst({
      where: { workout: { clientId: session.user.id }, authorId: { not: session.user.id } },
      orderBy: { createdAt: "desc" },
      include: { workout: { select: { id: true, scheduledDate: true } } },
    }),
    prisma.fastLog.findMany({ where: { userId: session.user.id }, orderBy: { startedAt: "desc" }, take: 14 }),
    // Completed vs. missed over the last 90 days (rest days and future days excluded).
    prisma.workout.findMany({
      where: {
        clientId: session.user.id,
        scheduledDate: { gte: new Date(now - 90 * DAY), lte: new Date(now) },
        ...clientVisible,
      },
      select: { isCompleted: true, _count: { select: { exercises: true } } },
    }),
  ])

  // Booking, and how many free calls are left, if the coach offers booking.
  const canBook = !!bookingFor(coachLink?.coach.coachProfile?.bookingUrl)
  const credits = canBook && coachLink ? await callCreditsFor(session.user.id, coachLink.coachId) : null
  const callsLeft = credits && !credits.unlimited ? credits.left : null

  // Where they are with their sessions, read from the coach's calendar.
  const counter = await counterForClient(session.user.id)
  const canPay = coachLink ? (await prisma.product.count({ where: { coachId: coachLink.coachId, active: true } })) > 0 : false
  const sessions = counter
    ? {
        used: counter.used,
        size: counter.size,
        left: counter.left,
        packageDone: counter.packageDone,
        next: counter.next ? { startsAt: counter.next.startsAt.toISOString(), endsAt: counter.next.endsAt?.toISOString() ?? null } : null,
        paymentDue: counter.paymentDue,
        estimated: counter.estimated,
      }
    : null

  const fastEntries = fasts.map((f) => ({ id: f.id, startedAt: f.startedAt.toISOString(), endedAt: f.endedAt?.toISOString() ?? null, targetHours: f.targetHours }))
  const scored = compliance.filter((w) => w._count.exercises > 0)
  const percent = scored.length ? Math.round((scored.filter((w) => w.isCompleted).length / scored.length) * 100) : null

  const days: DayWorkout[] = workouts.map((w) => ({
    id: w.id,
    day: dayKey(w.scheduledDate),
    name: w.name,
    programName: w.program?.name.trim() ?? null,
    // Week within the program, so the client knows where they are in the block.
    programWeek: w.program ? Math.floor((w.scheduledDate.getTime() - w.program.startDate.getTime()) / (7 * DAY)) + 1 : null,
    isCompleted: w.isCompleted,
    isRest: w.exercises.length === 0 && /rest/i.test(w.name),
    exerciseNames: w.exercises.map((e) => e.name ?? e.exercise?.name ?? "Exercise"),
    movedFrom: w.originalDate ? dayKey(w.originalDate) : null,
  }))

  const canMove = profile?.canMoveWorkouts ?? true

  return (
    <>
      <TodayView
        firstName={session.user.name?.split(" ")[0] ?? "there"}
        coachName={coachLink?.coach.name ?? null}
        canMove={canMove}
        compliance={percent}
        canBook={canBook}
        callsLeft={callsLeft}
        sessions={sessions}
        canPay={canPay}
        workouts={days}
        fasting={
          profile?.fastingEnabled
            ? {
                protocol: profile.fastingProtocol,
                targetHours: profile.fastingTargetHours,
                windowStart: profile.eatingWindowStart,
                windowEnd: profile.eatingWindowEnd,
                openFast: fastEntries.find((f) => !f.endedAt) ?? null,
                recent: fastEntries,
              }
            : null
        }
        latestNote={
          note ? { author: note.authorName, body: note.body, workoutId: note.workout.id, day: dayKey(note.workout.scheduledDate) } : null
        }
      />
      <Tour
        seen={!!profile?.tourSeenAt}
        coachName={coachLink?.coach.name ?? ""}
        canBook={canBook}
        canMove={canMove}
      />
    </>
  )
}
