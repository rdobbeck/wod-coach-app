import { prisma } from "@/lib/prisma"
import { aiToday } from "@/lib/ai/assist"

/**
 * Sessions a client trained but never tapped Finish on. Leaving a workout saves
 * everything logged, so a session can hold real work and still read as not
 * done, which undercounts streaks and history. Each morning, a session from an
 * earlier day is marked complete, exactly as Finish would, but only if some
 * work was logged: a ticked set, a result note or an RPE. A session nobody
 * touched stays incomplete, so a missed day still shows as missed. Typed-in
 * numbers that were never ticked don't count as work.
 *
 * Only the last week is looked at, so the first run never rewrites months of
 * imported history, and a skipped morning is caught up the next.
 */
export const LOOKBACK_DAYS = 7

/** Some work logged on this session: a ticked set, a result note or an RPE. */
const didWork = {
  logs: {
    some: {
      exerciseLogs: {
        some: {
          OR: [{ setLogs: { some: { isCompleted: true } } }, { resultText: { not: null } }, { rpe: { not: null } }],
        },
      },
    },
  },
}

export async function autoCompleteLoggedSessions(now = new Date()) {
  const today = aiToday(now)
  const before = new Date(`${today}T00:00:00.000Z`) // sessions sit at noon UTC on their day
  const since = new Date(before.getTime() - LOOKBACK_DAYS * 86_400_000)
  const sessions = await prisma.workout.findMany({
    where: {
      isCompleted: false,
      clientId: { not: null },
      scheduledDate: { gte: since, lt: before },
      OR: [{ programId: null }, { program: { isDraft: false } }],
      ...didWork,
    },
    select: { id: true, clientId: true, logs: { select: { id: true, updatedAt: true, userId: true } } },
  })
  for (const s of sessions) {
    await prisma.$transaction([
      prisma.workout.update({ where: { id: s.id }, data: { isCompleted: true } }),
      // Completed when they last logged in it, not when this ran.
      ...s.logs.filter((l) => l.userId === s.clientId).map((l) => prisma.workoutLog.update({ where: { id: l.id }, data: { completedAt: l.updatedAt } })),
    ])
  }
  return { completed: sessions.map((s) => s.id) }
}
