/**
 * Adds Product.stripeProductId. Safe to re-run. Run it BEFORE deploying the
 * code: Prisma selects every Product column, so the Pay screens fail if the
 * column isn't there yet.
 *   npx tsx scripts/add-stripe-product-id.ts preview
 *   npx tsx scripts/add-stripe-product-id.ts public
 */
import { config } from "dotenv"
config({ path: ".env.local" })
import { PrismaClient } from "@prisma/client"

const schema = process.argv[2]
if (!schema || !/^[a-z_]+$/.test(schema)) throw new Error("usage: add-stripe-product-id.ts <schema>  (e.g. preview | public)")
const base = process.env.POSTGRES_URL_NON_POOLING!
const p = new PrismaClient({ datasources: { db: { url: `${base}${base.includes("?") ? "&" : "?"}schema=${schema}` } } })

async function main() {
  await p.$executeRawUnsafe(`ALTER TABLE "${schema}"."Product" ADD COLUMN IF NOT EXISTS "stripeProductId" TEXT`)
  const c = await p.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'Product' AND column_name = 'stripeProductId'`, schema)
  console.log(schema, "->", c.length ? "stripeProductId present" : "MISSING column")
}
main().catch((e) => console.log("ERR", String(e.message).split("\n").filter(Boolean).pop())).finally(() => p.$disconnect())
