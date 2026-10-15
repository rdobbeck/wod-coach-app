/**
 * Adds the "when I'll train" columns to Workout (Schedule my session). Safe to
 * re-run. Run it BEFORE deploying the code: the deploy guard fails the build if
 * the schema this deploy uses lacks a column.
 *   npx tsx scripts/add-workout-plan.ts preview   # local and test data
 *   npx tsx scripts/add-workout-plan.ts public    # production
 */
import { config } from "dotenv"
config({ path: ".env.local" })
import { PrismaClient } from "@prisma/client"

const schema = process.argv[2]
if (!schema || !/^[a-z_]+$/.test(schema)) throw new Error("usage: add-workout-plan.ts <schema>  (e.g. preview | public)")
const base = process.env.POSTGRES_URL_NON_POOLING!
const p = new PrismaClient({ datasources: { db: { url: `${base}${base.includes("?") ? "&" : "?"}schema=${schema}` } } })
const s = `"${schema}"`

async function main() {
  await p.$executeRawUnsafe(`ALTER TABLE ${s}."Workout"
    ADD COLUMN IF NOT EXISTS "plannedTime" TEXT,
    ADD COLUMN IF NOT EXISTS "plannedMinutes" INTEGER,
    ADD COLUMN IF NOT EXISTS "plannedTz" TEXT,
    ADD COLUMN IF NOT EXISTS "plannedAt" TIMESTAMP(3)`)
  const c = await p.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'Workout' AND column_name LIKE 'planned%' ORDER BY column_name`, schema)
  console.log(schema, "-> Workout:", c.map((x) => x.column_name).join(", ") || "MISSING columns")
}
main().catch((e) => console.log("ERR", String(e.message).split("\n").filter(Boolean).pop())).finally(() => p.$disconnect())
