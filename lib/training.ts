import { prisma } from "./prisma"
import { exerciseKey } from "./exercise-key"
import { dayKey, summarizeEntry, type HistoryEntry } from "./training-format"

export { dayKey, fromDayKey, summarizeEntry, type HistoryEntry } from "./training-format"

/** Workouts a client may see: not part of a draft (unpublished) program. */
export const clientVisible = { OR: [{ programId: null }, { program: { isDraft: false } }] }

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

/** Completed workouts + one row per exercise (latest result first) for History screens. */
export async function getHistoryOverview(clientId: string) {
  const [workouts, logs] = await Promise.all([
    prisma.workout.findMany({
      where: { clientId, isCompleted: true, ...clientVisible },
      orderBy: { scheduledDate: "desc" },
      take: 200,
      select: { id: true, name: true, scheduledDate: true, program: { select: { name: true } }, _count: { select: { exercises: true } } },
    }),
    prisma.exerciseLog.findMany({
      where: { userId: clientId },
      orderBy: { performedAt: "desc" },
      include: {
        setLogs: { orderBy: { setNumber: "asc" } },
        workoutExercise: { select: { name: true, exercise: { select: { name: true } } } },
      },
    }),
  ])

  // One row per exercise (library exercise when linked, else normalized name).
  const seen = new Map<
    string,
    { exerciseId: string | null; name: string; lastDay: string; count: number; last: Pick<HistoryEntry, "resultText" | "rpe" | "sets"> }
  >()
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

  return {
    workouts: workouts.map((w) => ({ id: w.id, name: w.name, day: dayKey(w.scheduledDate), programName: w.program?.name ?? null, exerciseCount: w._count.exercises })),
    exercises: Array.from(seen.values()),
  }
}

/** Headline numbers, latest session and a trend for the coach's client page. */
export async function getClientSnapshot(clientId: string) {
  const now = Date.now()
  const [scored, completedCount, latest, activeProgram, topExercise] = await Promise.all([
    prisma.workout.findMany({
      where: { clientId, scheduledDate: { gte: new Date(now - 90 * 86_400_000), lte: new Date(now) }, ...clientVisible },
      select: { isCompleted: true, _count: { select: { exercises: true } } },
    }),
    prisma.workout.count({ where: { clientId, isCompleted: true } }),
    prisma.workout.findFirst({
      where: { clientId, isCompleted: true },
      orderBy: { scheduledDate: "desc" },
      include: {
        logs: { where: { userId: clientId }, include: { exerciseLogs: { include: { setLogs: { orderBy: { setNumber: "asc" } } } } } },
        exercises: { select: { id: true, name: true, exercise: { select: { name: true } } } },
      },
    }),
    prisma.program.findFirst({
      where: { clientId, isDraft: false, isActive: true },
      orderBy: { startDate: "desc" },
      select: { name: true, startDate: true, endDate: true },
    }),
    // The exercise this client logs most, for the trend chart.
    prisma.exerciseLog.groupBy({
      by: ["exerciseId"],
      where: { userId: clientId, exerciseId: { not: null }, setLogs: { some: { weight: { not: null } } } },
      _count: { exerciseId: true },
      orderBy: { _count: { exerciseId: "desc" } },
      take: 1,
    }),
  ])

  const rated = scored.filter((w) => w._count.exercises > 0)
  const compliance = rated.length ? Math.round((rated.filter((w) => w.isCompleted).length / rated.length) * 100) : null

  const log = latest?.logs[0]
  const nameOf = (weId: string) => {
    const e = latest?.exercises.find((x) => x.id === weId)
    return e?.exercise?.name ?? e?.name ?? "Exercise"
  }
  const latestSession = latest
    ? {
        id: latest.id,
        name: latest.name,
        day: dayKey(latest.scheduledDate),
        note: log?.notes ?? null,
        lines: (log?.exerciseLogs ?? []).slice(0, 6).map((x) => ({
          name: nameOf(x.workoutExerciseId),
          summary: summarizeEntry(
            { resultText: x.resultText, rpe: x.rpe, sets: x.setLogs.map((s) => ({ setNumber: s.setNumber, reps: s.reps, weight: s.weight, rpe: s.rpe })) },
            "lb"
          ),
        })),
      }
    : null

  let trend: { name: string; points: { day: string; weight: number }[] } | null = null
  const exerciseId = topExercise[0]?.exerciseId
  if (exerciseId) {
    const [exercise, logs] = await Promise.all([
      prisma.exerciseLibrary.findUnique({ where: { id: exerciseId }, select: { name: true } }),
      prisma.exerciseLog.findMany({
        where: { userId: clientId, exerciseId },
        orderBy: { performedAt: "desc" },
        take: 6,
        include: { setLogs: { select: { weight: true } } },
      }),
    ])
    const points = logs
      .map((l) => ({ day: dayKey(l.performedAt), weight: Math.max(...l.setLogs.map((s) => s.weight ?? 0), 0) }))
      .filter((p) => p.weight > 0)
      .reverse()
    if (exercise && points.length >= 2) trend = { name: exercise.name, points }
  }

  const programWeek =
    activeProgram && activeProgram.startDate.getTime() <= now
      ? {
          name: activeProgram.name.trim(),
          week: Math.floor((now - activeProgram.startDate.getTime()) / (7 * 86_400_000)) + 1,
          total: activeProgram.endDate
            ? Math.max(Math.round((activeProgram.endDate.getTime() - activeProgram.startDate.getTime()) / (7 * 86_400_000)), 1)
            : null,
        }
      : null

  return { compliance, completedCount, latestSession, trend, programWeek }
}
