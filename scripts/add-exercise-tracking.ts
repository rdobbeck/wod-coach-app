/**
 * Adds ExerciseLibrary.tracking and tags carries and sleds as "distance", so a
 * target with no unit ("3 x 2" on a sled) still logs distance. A unit in the
 * coach's target always wins over the tag (lib/hold.ts).
 * Safe to re-run. Run it BEFORE deploying the code that reads the column.
 *   npx tsx scripts/add-exercise-tracking.ts preview            (column + list what would be tagged)
 *   npx tsx scripts/add-exercise-tracking.ts preview --apply    (column + tag)
 *   npx tsx scripts/add-exercise-tracking.ts public --apply
 */
import { config } from "dotenv"
config({ path: ".env.local" })
import { PrismaClient } from "@prisma/client"

const schema = process.argv[2]
const apply = process.argv.includes("--apply")
if (!schema) throw new Error("usage: add-exercise-tracking.ts <schema> [--apply]")
const base = process.env.POSTGRES_URL_NON_POOLING!
const p = new PrismaClient({ datasources: { db: { url: `${base}${base.includes("?") ? "&" : "?"}schema=${schema}` } } })

// Moved over a distance. "Front Carry Squat" and the like are a carry position, not a carry.
export const DISTANCE_NAME = /\bcarr(?:y|ies)\b|\bfarmer['’]?s? walk|\bsled (?:push|pull|drag)|\bsled drag\b|\breverse drag\b|\bprowler\b|\byoke walk\b/i
export const NOT_DISTANCE = /squat|lunge|step up|split|\bhold\b/i

async function main() {
  await p.$executeRawUnsafe(`ALTER TABLE "${schema}"."ExerciseLibrary" ADD COLUMN IF NOT EXISTS "tracking" TEXT`)
  const rows = await p.$queryRawUnsafe<{ id: string; name: string; tracking: string | null }[]>(
    `SELECT id, name, tracking FROM "${schema}"."ExerciseLibrary" ORDER BY name`)
  const tag = rows.filter((r) => DISTANCE_NAME.test(r.name) && !NOT_DISTANCE.test(r.name) && r.tracking !== "distance")
  console.log(`${schema}: column present; ${tag.length} exercise(s) to tag as distance${apply ? "" : " (dry run, pass --apply)"}`)
  tag.forEach((r) => console.log(`  ${r.name}`))
  if (apply && tag.length) {
    const n = await p.$executeRawUnsafe(`UPDATE "${schema}"."ExerciseLibrary" SET tracking = 'distance' WHERE id = ANY($1::text[])`, tag.map((r) => r.id))
    console.log(`tagged ${n}`)
  }
}
main().catch((e) => console.log("ERR", String(e.message).split("\n").filter(Boolean).pop())).finally(() => p.$disconnect())
