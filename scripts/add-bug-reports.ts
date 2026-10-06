/**
 * Adds the BugReport table (problems clients report from inside the app, with
 * screenshots). Safe to re-run. Run it BEFORE deploying the code: the deploy
 * guard fails the build if the schema this deploy uses lacks the table.
 *   npx tsx scripts/add-bug-reports.ts preview   # local and test data
 *   npx tsx scripts/add-bug-reports.ts public    # production
 */
import { config } from "dotenv"
config({ path: ".env.local" })
import { PrismaClient } from "@prisma/client"

const schema = process.argv[2]
if (!schema || !/^[a-z_]+$/.test(schema)) throw new Error("usage: add-bug-reports.ts <schema>  (e.g. preview | public)")
const base = process.env.POSTGRES_URL_NON_POOLING!
const p = new PrismaClient({ datasources: { db: { url: `${base}${base.includes("?") ? "&" : "?"}schema=${schema}` } } })
const s = `"${schema}"`

async function main() {
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${s}."BugReport" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES ${s}."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "body" TEXT NOT NULL,
    "path" TEXT,
    "userAgent" TEXT,
    "viewport" TEXT,
    "installed" BOOLEAN NOT NULL DEFAULT false,
    "screenshots" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  await p.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BugReport_resolvedAt_createdAt_idx" ON ${s}."BugReport"("resolvedAt", "createdAt")`)
  await p.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BugReport_userId_idx" ON ${s}."BugReport"("userId")`)
  const c = await p.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'BugReport' ORDER BY ordinal_position`, schema)
  console.log(schema, "-> BugReport:", c.map((x) => x.column_name).join(", ") || "MISSING table")
}
main().catch((e) => console.log("ERR", String(e.message).split("\n").filter(Boolean).pop())).finally(() => p.$disconnect())
