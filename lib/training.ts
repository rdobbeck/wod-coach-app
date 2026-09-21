import { prisma } from "./prisma"
import { exerciseKey } from "./exercise-key"
import { dayKey, type HistoryEntry } from "./training-format"

export { dayKey, fromDayKey, summarizeEntry, type HistoryEntry } from "./training-format"

/** True if `userId` is the client themself or one of the client's coaches. */
export async function canAccessClient(userId: string, clientId: string) {
  if (userId === clientId) return true
  const link = await prisma.clientCoach.findUnique({
    where: { clientId_coachId: { clientId, coachId: userId } },
  })
  return !!link
}

/** How history entries are grouped: by library exercise when linked, else by name. */
export type ExerciseRef = { exerciseId: string | null; name: string }

function historyWhere(clientId: string, ref: ExerciseRef) {
  return ref.exerciseId
    ? { userId: clientId, exerciseId: ref.exerciseId }
    : { userId: clientId, exerciseKey: exerciseKey(ref.name) }
}

/** Every logged instance of an exercise for a client, newest first. */
export async function getExerciseHistory(clientId: string, ref: ExerciseRef, limit = 50): Promise<HistoryEntry[]> {
  const logs = await prisma.exerciseLog.findMany({
    where: historyWhere(clientId, ref),
    orderBy: { performedAt: "desc" },
    take: limit,
    include: {
      setLogs: { orderBy: { setNumber: "asc" } },
      workoutExercise: { select: { name: true, exercise: { select: { name: true } }, workout: { select: { id: true, name: true } } } },
    },
  })
  return logs
    .filter((l) => l.resultText || l.rpe !== null || l.setLogs.length)
    .map((l) => ({
      id: l.id,
      date: dayKey(l.performedAt),
      workoutId: l.workoutExercise.workout.id,
      workoutName: l.workoutExercise.workout.name,
      exerciseName: l.workoutExercise.name ?? l.workoutExercise.exercise?.name ?? "Exercise",
      resultText: l.resultText,
      rpe: l.rpe,
      sets: l.setLogs.map((s) => ({ setNumber: s.setNumber, reps: s.reps, weight: s.weight, rpe: s.rpe })),
    }))
}

/**
 * Most recent previous entry for each exercise in a workout ("Last time" line).
 * Only looks at logs from other workouts, so today's own entry never shows as last time.
 */
export async function getLastTimes(
  clientId: string,
  workoutId: string,
  exercises: { id: string; exerciseId: string | null; name: string }[]
): Promise<Record<string, HistoryEntry | null>> {
  const out: Record<string, HistoryEntry | null> = {}
  await Promise.all(
    exercises.map(async (e) => {
      const [last] = (await getExerciseHistory(clientId, e, 5)).filter((h) => h.workoutId !== workoutId)
      out[e.id] = last ?? null
    })
  )
  return out
}
