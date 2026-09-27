/**
 * Adds User.username (sign-in username, stored lowercase, unique). Safe to re-run.
 * Run it BEFORE deploying the code: Prisma selects every User column, so the app
 * fails on every user query if the column isn't there yet.
 *   npx tsx scripts/add-username.ts preview   # local and test data
 *   npx tsx scripts/add-username.ts public    # production
 */
import { config } from "dotenv"
config({ path: ".env.local" })
import { PrismaClient } from "@prisma/client"

const schema = process.argv[2]
if (!schema || !/^[a-z_]+$/.test(schema)) throw new Error("usage: add-username.ts <schema>  (e.g. preview | public)")
const base = process.env.POSTGRES_URL_NON_POOLING!
const p = new PrismaClient({ datasources: { db: { url: `${base}${base.includes("?") ? "&" : "?"}schema=${schema}` } } })
const s = `"${schema}"`

async function main() {
  await p.$executeRawUnsafe(`ALTER TABLE ${s}."User" ADD COLUMN IF NOT EXISTS "username" TEXT`)
  await p.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON ${s}."User"("username")`)
  const c = await p.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'User' AND column_name = 'username'`, schema)
  const i = await p.$queryRawUnsafe<{ indexname: string }[]>(
    `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = 'User' AND indexname = 'User_username_key'`, schema)
  console.log(schema, "->", c.map((x) => x.column_name).join(", ") || "MISSING column", "|", i.map((x) => x.indexname).join(", ") || "MISSING index")
}
main().catch((e) => console.log("ERR", String(e.message).split("\n").filter(Boolean).pop())).finally(() => p.$disconnect())
