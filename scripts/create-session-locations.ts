/**
 * Adds the places a coach trains clients (SessionLocation) and the coach's text
 * number for "text me to set up a time". Safe to re-run.
 *   npx tsx scripts/create-session-locations.ts preview   # local and test data
 *   npx tsx scripts/create-session-locations.ts public    # production
 */
import { config } from "dotenv"
config({ path: ".env.local" })
import { PrismaClient } from "@prisma/client"

const schema = process.argv[2]
if (!schema) throw new Error("usage: create-session-locations.ts <schema>")
const base = process.env.POSTGRES_URL_NON_POOLING!
const p = new PrismaClient({ datasources: { db: { url: `${base}${base.includes("?") ? "&" : "?"}schema=${schema}` } } })
const s = `"${schema}"`

async function main() {
  await p.$executeRawUnsafe(`ALTER TABLE ${s}."CoachProfile" ADD COLUMN IF NOT EXISTS "textNumber" TEXT`)
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${s}."SessionLocation" (
    "id" TEXT PRIMARY KEY, "coachId" TEXT NOT NULL, "label" TEXT NOT NULL, "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionLocation_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES ${s}."User"("id") ON DELETE CASCADE ON UPDATE CASCADE)`)
  await p.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SessionLocation_coachId_sortOrder_idx" ON ${s}."SessionLocation"("coachId","sortOrder")`)
  const t = await p.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'SessionLocation'`, schema)
  const c = await p.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'CoachProfile' AND column_name = 'textNumber'`, schema)
  console.log(schema, "->", t.map((x) => x.table_name).join(", "), "|", c.map((x) => x.column_name).join(", "))
}
main().catch((e) => console.log("ERR", String(e.message).split("\n").filter(Boolean).pop())).finally(() => p.$disconnect())
