/**
 * Creates the session counter's tables (SessionEvent, SessionSyncState, ClientAlias).
 * Safe to re-run.
 *   npx tsx scripts/create-session-tables.ts preview   # local and test data
 *   npx tsx scripts/create-session-tables.ts public    # production
 */
import { config } from "dotenv"
config({ path: ".env.local" })
import { PrismaClient } from "@prisma/client"

const schema = process.argv[2]
if (!schema) throw new Error("usage: create-session-tables.ts <schema>")
const base = process.env.POSTGRES_URL_NON_POOLING!
const p = new PrismaClient({ datasources: { db: { url: `${base}${base.includes("?") ? "&" : "?"}schema=${schema}` } } })
const s = `"${schema}"`

async function main() {
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${s}."SessionEvent" (
    "id" TEXT PRIMARY KEY, "coachId" TEXT NOT NULL, "uid" TEXT NOT NULL, "clientIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "title" TEXT NOT NULL, "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3),
    "packageIndex" INTEGER, "packageSize" INTEGER, "indexInferred" BOOLEAN NOT NULL DEFAULT false,
    "needsPayment" BOOLEAN NOT NULL DEFAULT false, "paidOverride" BOOLEAN NOT NULL DEFAULT false, "matchedBy" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  await p.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "SessionEvent_coachId_uid_key" ON ${s}."SessionEvent"("coachId","uid")`)
  await p.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SessionEvent_coachId_startsAt_idx" ON ${s}."SessionEvent"("coachId","startsAt")`)
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${s}."SessionSyncState" (
    "coachId" TEXT PRIMARY KEY, "lastSyncAt" TIMESTAMP(3), "lastReport" JSONB, "lastError" TEXT)`)
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${s}."ClientAlias" (
    "id" TEXT PRIMARY KEY, "coachId" TEXT NOT NULL, "clientId" TEXT NOT NULL, "alias" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  await p.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ClientAlias_coachId_alias_key" ON ${s}."ClientAlias"("coachId","alias")`)
  await p.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ClientAlias_clientId_idx" ON ${s}."ClientAlias"("clientId")`)
  const t = await p.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name IN ('SessionEvent','SessionSyncState','ClientAlias') ORDER BY 1`, schema)
  console.log(schema, "->", t.map((x) => x.table_name).join(", "))
}
main().catch((e) => console.log("ERR", String(e.message).split("\n").filter(Boolean).pop())).finally(() => p.$disconnect())
