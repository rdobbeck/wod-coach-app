import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { clientVisible, dayKey } from "@/lib/training"
import TodayView, { type DayWorkout } from "@/components/client/TodayView"

const DAY = 86_400_000

export default async function ClientToday() {
  const session = (await getServerSession(authOptions))!
  const now = Date.now()
  const [workouts, profile, coachLink, note, compliance] = await Promise.all([
    prisma.workout.findMany({
      where: {
        clientId: session.user.id,
        scheduledDate: { gte: new Date(now - 21 * DAY), lte: new Date(now + 21 * DAY) },
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
      include: { coach: { select: { name: true } } },
    }),
    // Most recent coach comment on any of this client's workouts.
    prisma.workoutComment.findFirst({
      where: { workout: { clientId: session.user.id }, authorId: { not: session.user.id } },
      orderBy: { createdAt: "desc" },
      include: { workout: { select: { id: true, scheduledDate: true } } },
    }),
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

  return (
    <TodayView
      firstName={session.user.name?.split(" ")[0] ?? "there"}
      coachName={coachLink?.coach.name ?? null}
      canMove={profile?.canMoveWorkouts ?? true}
      compliance={percent}
      workouts={days}
      latestNote={
        note ? { author: note.authorName, body: note.body, workoutId: note.workout.id, day: dayKey(note.workout.scheduledDate) } : null
      }
    />
  )
}
