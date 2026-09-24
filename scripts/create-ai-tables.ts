/**
 * Creates the AI assistant's tables (AiUsage, AiChangeSet). Safe to re-run.
 *   npx tsx scripts/create-ai-tables.ts preview   # local and test data
 *   npx tsx scripts/create-ai-tables.ts public    # production
 */
import { config } from "dotenv"
config({ path: ".env.local" })
import { PrismaClient } from "@prisma/client"
const schema = process.argv[2]
if (!schema) throw new Error("usage: create-ai-tables.ts <schema>")
const base = process.env.POSTGRES_URL_NON_POOLING!
const p = new PrismaClient({ datasources: { db: { url: `${base}${base.includes("?") ? "&" : "?"}schema=${schema}` } } })
const s = `"${schema}"`
async function main() {
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${s}."AiUsage" (
    "id" TEXT PRIMARY KEY, "coachId" TEXT NOT NULL, "clientId" TEXT, "kind" TEXT NOT NULL, "model" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0, "tokensOut" INTEGER NOT NULL DEFAULT 0, "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  await p.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AiUsage_coachId_createdAt_idx" ON ${s}."AiUsage"("coachId","createdAt")`)
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${s}."AiChangeSet" (
    "id" TEXT PRIMARY KEY, "coachId" TEXT NOT NULL, "clientId" TEXT NOT NULL, "request" TEXT NOT NULL, "applied" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "undoneAt" TIMESTAMP(3))`)
  await p.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AiChangeSet_clientId_createdAt_idx" ON ${s}."AiChangeSet"("clientId","createdAt")`)
  const t = await p.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name IN ('AiUsage','AiChangeSet') ORDER BY 1`, schema)
  console.log(schema, "->", t.map((x) => x.table_name).join(", "))
}
main().catch((e) => console.log("ERR", String(e.message).split("\n").filter(Boolean).pop())).finally(() => p.$disconnect())
