/**
 * Deploy guard, run before `next build`. On Vercel it checks that the database
 * schema this deploy will use (DB_SCHEMA, else public) has every column in
 * prisma/schema.prisma, and fails the build if not, so the live version stays
 * up instead of a new one crashing on every query. Run the column's add-*.ts
 * script against that schema, then redeploy.
 *
 * Skipped off Vercel unless --check is passed. If the database can't be reached
 * the build continues with a warning: a Supabase blip shouldn't block deploys.
 *   npx tsx scripts/check-db-schema.ts --check
 */
import { Prisma, PrismaClient } from "@prisma/client"
import { expectedColumns, missingColumns } from "../lib/schema-drift"

async function main() {
  if (!process.env.VERCEL && !process.argv.includes("--check")) return
  const url = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_PRISMA_URL
  if (!url) {
    console.warn("[schema-check] no database URL, skipping")
    return
  }
  const schema = process.env.DB_SCHEMA || "public"
  const p = new PrismaClient({ datasources: { db: { url } } })
  let actual: { table_name: string; column_name: string }[]
  try {
    actual = await p.$queryRawUnsafe(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = $1`, schema)
  } catch (e) {
    console.warn(`[schema-check] couldn't read the database, skipping: ${String((e as Error).message).split("\n").filter(Boolean).pop()}`)
    return
  } finally {
    await p.$disconnect()
  }

  const missing = missingColumns(expectedColumns(Prisma.dmmf.datamodel.models), actual)
  if (!missing.length) {
    console.log(`[schema-check] ${schema}: every column the code reads is present`)
    return
  }
  console.error(`\n[schema-check] STOPPING THE BUILD. The "${schema}" database is missing columns this code reads:`)
  missing.forEach((m) => console.error(`  - ${m}`))
  console.error(`Run the matching scripts/add-*.ts (or create-*.ts) script with \`${schema}\`, then redeploy.\n`)
  process.exit(1)
}

main()
