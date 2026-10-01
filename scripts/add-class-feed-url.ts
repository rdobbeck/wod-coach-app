/**
 * Adds CoachProfile.classFeedUrl, the feed of group classes a coach teaches.
 * Safe to re-run. Run it BEFORE deploying the code that reads it.
 *   npx tsx scripts/add-class-feed-url.ts preview
 *   npx tsx scripts/add-class-feed-url.ts public
 */
import { config } from "dotenv"
config({ path: ".env.local" })
import { PrismaClient } from "@prisma/client"

const schema = process.argv[2]
if (!schema) throw new Error("usage: add-class-feed-url.ts <schema>")
const base = process.env.POSTGRES_URL_NON_POOLING!
const p = new PrismaClient({ datasources: { db: { url: `${base}${base.includes("?") ? "&" : "?"}schema=${schema}` } } })

async function main() {
  await p.$executeRawUnsafe(`ALTER TABLE "${schema}"."CoachProfile" ADD COLUMN IF NOT EXISTS "classFeedUrl" TEXT`)
  const c = await p.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'CoachProfile' AND column_name = 'classFeedUrl'`, schema)
  console.log(schema, "->", c.map((x) => x.column_name).join(", ") || "MISSING")
}
main().catch((e) => console.log("ERR", String(e.message).split("\n").filter(Boolean).pop())).finally(() => p.$disconnect())
