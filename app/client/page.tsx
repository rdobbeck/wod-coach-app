import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { dayKey } from "@/lib/training"
import TodayView, { type DayWorkout } from "@/components/client/TodayView"

export default async function ClientToday() {
  const session = (await getServerSession(authOptions))!
  const now = Date.now()
  const [workouts, profile, coachLink] = await Promise.all([
    prisma.workout.findMany({
      where: {
        clientId: session.user.id,
        scheduledDate: { gte: new Date(now - 21 * 86_400_000), lte: new Date(now + 21 * 86_400_000) },
      },
      orderBy: [{ scheduledDate: "asc" }, { order: "asc" }],
      include: {
        program: { select: { name: true } },
        exercises: { orderBy: { order: "asc" }, select: { name: true, exercise: { select: { name: true } } } },
      },
    }),
    prisma.clientProfile.findUnique({ where: { userId: session.user.id } }),
    prisma.clientCoach.findFirst({
      where: { clientId: session.user.id, status: "ACTIVE" },
      include: { coach: { select: { name: true } } },
    }),
  ])

  const days: DayWorkout[] = workouts.map((w) => ({
    id: w.id,
    day: dayKey(w.scheduledDate),
    name: w.name,
    programName: w.program?.name ?? null,
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
      workouts={days}
    />
  )
}
