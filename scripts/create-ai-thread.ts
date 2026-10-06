/**
 * Saved Ask AI threads and client access. Safe to re-run.
 *   npx tsx scripts/create-ai-thread.ts preview   # local and test data
 *   npx tsx scripts/create-ai-thread.ts public    # production, BEFORE pushing
 */
import { config } from "dotenv"
config({ path: ".env.local" })
import { PrismaClient } from "@prisma/client"
const schema = process.argv[2]
if (!schema) throw new Error("usage: create-ai-thread.ts <schema>")
const base = process.env.POSTGRES_URL_NON_POOLING!
const p = new PrismaClient({ datasources: { db: { url: `${base}${base.includes("?") ? "&" : "?"}schema=${schema}` } } })
const s = `"${schema}"`
async function main() {
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${s}."AiThread" (
    "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "clientId" TEXT NOT NULL, "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  await p.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "AiThread_userId_clientId_key" ON ${s}."AiThread"("userId","clientId")`)
  await p.$executeRawUnsafe(`ALTER TABLE ${s}."ClientProfile" ADD COLUMN IF NOT EXISTS "canAskAi" BOOLEAN NOT NULL DEFAULT false`)
  await p.$executeRawUnsafe(`ALTER TABLE ${s}."AiChangeSet" ADD COLUMN IF NOT EXISTS "appliedById" TEXT`)
  const cols = await p.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = $1
     AND ((table_name = 'AiThread') OR (table_name = 'ClientProfile' AND column_name = 'canAskAi') OR (table_name = 'AiChangeSet' AND column_name = 'appliedById')) ORDER BY 1, 2`,
    schema,
  )
  console.log(schema, "->", cols.map((c) => `${c.table_name}.${c.column_name}`).join(", "))
}
main().catch((e) => console.log("ERR", String(e.message).split("\n").filter(Boolean).pop())).finally(() => p.$disconnect())
