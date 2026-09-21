import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { dayKey } from "@/lib/training"
import HistoryView from "@/components/client/HistoryView"

export default async function ClientHistory() {
  const session = (await getServerSession(authOptions))!
  const userId = session.user.id
  const [workouts, logs, profile] = await Promise.all([
    prisma.workout.findMany({
      where: { clientId: userId, isCompleted: true },
      orderBy: { scheduledDate: "desc" },
      take: 200,
      select: { id: true, name: true, scheduledDate: true, program: { select: { name: true } }, _count: { select: { exercises: true } } },
    }),
    prisma.exerciseLog.findMany({
      where: { userId },
      orderBy: { performedAt: "desc" },
      include: {
        setLogs: { orderBy: { setNumber: "asc" } },
        workoutExercise: { select: { name: true, exercise: { select: { name: true } } } },
      },
    }),
    prisma.clientProfile.findUnique({ where: { userId } }),
  ])

  // One row per exercise (library exercise when linked, else normalized name), latest first.
  const seen = new Map<string, { exerciseId: string | null; name: string; lastDay: string; count: number; last: { resultText: string | null; rpe: number | null; sets: { setNumber: number; reps: number | null; weight: number | null; rpe: number | null }[] } }>()
  for (const l of logs) {
    const key = l.exerciseId ?? `name:${l.exerciseKey}`
    const row = seen.get(key)
    if (row) {
      row.count++
      continue
    }
    seen.set(key, {
      exerciseId: l.exerciseId,
      name: l.workoutExercise.exercise?.name ?? l.workoutExercise.name ?? "Exercise",
      lastDay: dayKey(l.performedAt),
      count: 1,
      last: { resultText: l.resultText, rpe: l.rpe, sets: l.setLogs.map((s) => ({ setNumber: s.setNumber, reps: s.reps, weight: s.weight, rpe: s.rpe })) },
    })
  }

  return (
    <HistoryView
      units={profile?.units ?? "lb"}
      workouts={workouts.map((w) => ({ id: w.id, name: w.name, day: dayKey(w.scheduledDate), programName: w.program?.name ?? null, exerciseCount: w._count.exercises }))}
      exercises={Array.from(seen.values())}
    />
  )
}
