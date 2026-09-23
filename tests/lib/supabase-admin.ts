import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../../lib/db-url"

/**
 * Test helpers for the exercise library.
 *
 * These go through Prisma rather than Supabase's REST API on purpose: REST only
 * exposes schemas listed in the project's API settings, so it cannot see the
 * `preview` schema that local and preview runs use. Prisma talks to Postgres
 * directly and honours DB_SCHEMA, so a lock written here is a lock the app
 * under test actually reads.
 */
let cached: PrismaClient | null = null

export function getAdmin(): PrismaClient {
  if (cached) return cached
  cached = new PrismaClient({ datasources: { db: { url: dbUrl() } } })
  return cached
}

async function setLocked(coachrxId: string, locked: boolean, label: string) {
  const { count } = await getAdmin().exerciseLibrary.updateMany({
    where: { coachrxId },
    data: { locked },
  })
  if (!count) throw new Error(`${label}(${coachrxId}): no ExerciseLibrary row with that coachrx_id`)
}

export async function lockRowByCoachrxId(coachrxId: string): Promise<void> {
  await setLocked(coachrxId, true, "lockRowByCoachrxId")
}

export async function unlockRowByCoachrxId(coachrxId: string): Promise<void> {
  await setLocked(coachrxId, false, "unlockRowByCoachrxId")
}

export async function getNameForCoachrxId(coachrxId: string): Promise<string | null> {
  const row = await getAdmin().exerciseLibrary.findFirst({
    where: { coachrxId },
    select: { name: true },
  })
  if (!row) throw new Error(`getNameForCoachrxId(${coachrxId}): no row with that coachrx_id`)
  return row.name
}
