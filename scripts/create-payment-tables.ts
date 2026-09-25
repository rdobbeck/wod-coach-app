/**
 * Adds the payments tables (Product, Payment) and the coach's Venmo and bank
 * fields. Safe to re-run.
 *   npx tsx scripts/create-payment-tables.ts preview   # local and test data
 *   npx tsx scripts/create-payment-tables.ts public    # production
 */
import { config } from "dotenv"
config({ path: ".env.local" })
import { PrismaClient } from "@prisma/client"

const schema = process.argv[2]
if (!schema) throw new Error("usage: create-payment-tables.ts <schema>")
const base = process.env.POSTGRES_URL_NON_POOLING!
const p = new PrismaClient({ datasources: { db: { url: `${base}${base.includes("?") ? "&" : "?"}schema=${schema}` } } })
const s = `"${schema}"`

async function main() {
  await p.$executeRawUnsafe(`ALTER TABLE ${s}."CoachProfile" ADD COLUMN IF NOT EXISTS "venmoHandle" TEXT`)
  await p.$executeRawUnsafe(`ALTER TABLE ${s}."CoachProfile" ADD COLUMN IF NOT EXISTS "payInstructions" TEXT`)
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${s}."Product" (
    "id" TEXT PRIMARY KEY, "coachId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "priceCents" INTEGER NOT NULL,
    "sessions" INTEGER NOT NULL DEFAULT 1, "active" BOOLEAN NOT NULL DEFAULT true, "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  await p.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Product_coachId_active_idx" ON ${s}."Product"("coachId","active")`)
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${s}."Payment" (
    "id" TEXT PRIMARY KEY, "coachId" TEXT NOT NULL, "clientId" TEXT, "productId" TEXT, "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'usd', "method" TEXT NOT NULL, "status" TEXT NOT NULL,
    "payerEmail" TEXT, "payerName" TEXT, "stripeSessionId" TEXT, "stripePaymentIntent" TEXT, "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "confirmedAt" TIMESTAMP(3))`)
  await p.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Payment_stripeSessionId_key" ON ${s}."Payment"("stripeSessionId")`)
  await p.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Payment_coachId_createdAt_idx" ON ${s}."Payment"("coachId","createdAt")`)
  await p.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Payment_clientId_idx" ON ${s}."Payment"("clientId")`)
  const t = await p.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name IN ('Product','Payment') ORDER BY 1`, schema)
  const c = await p.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'CoachProfile' AND column_name IN ('venmoHandle','payInstructions') ORDER BY 1`, schema)
  console.log(schema, "->", t.map((x) => x.table_name).join(", "), "|", c.map((x) => x.column_name).join(", "))
}
main().catch((e) => console.log("ERR", String(e.message).split("\n").filter(Boolean).pop())).finally(() => p.$disconnect())
