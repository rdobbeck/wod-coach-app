import { prisma } from "@/lib/prisma"

const TTL_MS = 10 * 60 * 1000
let cache: { at: number; counts: Map<string, number> } | null = null

/**
 * How often each library exercise is used: its rows in WorkoutExercise (programmed) plus
 * ExerciseLog (logged). Train it and the review screen rank by it. Kept ten minutes per server
 * instance; the numbers move slowly and the Train it answer is cached at the edge anyway.
 */
export async function usageCounts(): Promise<Map<string, number>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.counts
  const [programmed, logged] = await Promise.all([
    prisma.workoutExercise.groupBy({ by: ["exerciseId"], where: { exerciseId: { not: null } }, _count: { _all: true } }),
    prisma.exerciseLog.groupBy({ by: ["exerciseId"], where: { exerciseId: { not: null } }, _count: { _all: true } }),
  ])
  const counts = new Map<string, number>()
  const add = (groups: { exerciseId: string | null; _count: { _all: number } }[]) => {
    for (const g of groups) if (g.exerciseId) counts.set(g.exerciseId, (counts.get(g.exerciseId) ?? 0) + g._count._all)
  }
  add(programmed)
  add(logged)
  cache = { at: Date.now(), counts }
  return counts
}
