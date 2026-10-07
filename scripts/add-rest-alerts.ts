/**
 * Adds the RestAlert table (a "Rest's up" push waiting to go out while the
 * phone is locked). Safe to re-run. Run it BEFORE deploying the code: the
 * deploy guard fails the build if the schema this deploy uses lacks the table.
 *   npx tsx scripts/add-rest-alerts.ts preview   # local and test data
 *   npx tsx scripts/add-rest-alerts.ts public    # production
 */
import { config } from "dotenv"
config({ path: ".env.local" })
import { PrismaClient } from "@prisma/client"

const schema = process.argv[2]
if (!schema || !/^[a-z_]+$/.test(schema)) throw new Error("usage: add-rest-alerts.ts <schema>  (e.g. preview | public)")
const base = process.env.POSTGRES_URL_NON_POOLING!
const p = new PrismaClient({ datasources: { db: { url: `${base}${base.includes("?") ? "&" : "?"}schema=${schema}` } } })
const s = `"${schema}"`

async function main() {
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${s}."RestAlert" (
    "userId" TEXT PRIMARY KEY REFERENCES ${s}."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "workoutId" TEXT NOT NULL,
    "exercise" TEXT NOT NULL,
    "fireAt" TIMESTAMP(3) NOT NULL,
    "nonce" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  const c = await p.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'RestAlert' ORDER BY ordinal_position`, schema)
  console.log(schema, "-> RestAlert:", c.map((x) => x.column_name).join(", ") || "MISSING table")
}
main().catch((e) => console.log("ERR", String(e.message).split("\n").filter(Boolean).pop())).finally(() => p.$disconnect())
