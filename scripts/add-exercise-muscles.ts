/**
 * Adds ExerciseLibrary.primary_muscles, secondary_muscles and muscles_reviewed_at, then drafts the
 * muscles of every unreviewed exercise from its name (lib/muscles/infer.ts). Rows Ryan reviewed are
 * never touched. Safe to re-run: after a rule change it rewrites only the drafts that changed.
 * Without --apply it only reads (it adds no column), so a dry run against production is safe.
 * Run --apply on a schema BEFORE deploying code that reads the columns (scripts/check-db-schema.ts).
 *   npx tsx scripts/add-exercise-muscles.ts preview              (what --apply would write, with a sample)
 *   npx tsx scripts/add-exercise-muscles.ts public --top=300     (the 300 most-used and their drafts)
 *   npx tsx scripts/add-exercise-muscles.ts preview --apply
 *   npx tsx scripts/add-exercise-muscles.ts public --apply       (production: only with Ryan's go-ahead)
 */
import { config } from "dotenv"
config({ path: ".env.local" })
import { PrismaClient } from "@prisma/client"
import { batchByTags } from "../lib/muscles/batch"
import { inferMuscles } from "../lib/muscles/infer"

const schema = process.argv[2]
const apply = process.argv.includes("--apply")
const top = Number(process.argv.find((a) => a.startsWith("--top="))?.slice("--top=".length) ?? 0)
if (!schema || schema.startsWith("--")) throw new Error("usage: add-exercise-muscles.ts <schema> [--apply] [--top=N]")
const base = process.env.POSTGRES_URL_NON_POOLING!
const p = new PrismaClient({ datasources: { db: { url: `${base}${base.includes("?") ? "&" : "?"}schema=${schema}` } } })
const T = `"${schema}"."ExerciseLibrary"`

type Row = { id: string; name: string; primary: string[]; secondary: string[]; reviewed: Date | null }
const show = (t: { primary: readonly string[]; secondary: readonly string[] }) =>
  t.primary.length || t.secondary.length ? `${t.primary.join(", ") || "none"} / ${t.secondary.join(", ") || "none"}` : "(no tags)"

async function main() {
  const cols = await p.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'ExerciseLibrary' AND column_name IN ('primary_muscles', 'secondary_muscles', 'muscles_reviewed_at')`,
    schema,
  )
  let present = cols[0].n === 3
  if (apply && !present) {
    await p.$executeRawUnsafe(`ALTER TABLE ${T} ADD COLUMN IF NOT EXISTS "primary_muscles" TEXT[] NOT NULL DEFAULT '{}'`)
    await p.$executeRawUnsafe(`ALTER TABLE ${T} ADD COLUMN IF NOT EXISTS "secondary_muscles" TEXT[] NOT NULL DEFAULT '{}'`)
    await p.$executeRawUnsafe(`ALTER TABLE ${T} ADD COLUMN IF NOT EXISTS "muscles_reviewed_at" TIMESTAMP(3)`)
    present = true
    console.log(`${schema}: columns added`)
  }
  const rows = await p.$queryRawUnsafe<Row[]>(
    present
      ? `SELECT id, name, primary_muscles AS "primary", secondary_muscles AS "secondary", muscles_reviewed_at AS "reviewed" FROM ${T} ORDER BY name, id`
      : `SELECT id, name, '{}'::text[] AS "primary", '{}'::text[] AS "secondary", NULL::timestamp AS "reviewed" FROM ${T} ORDER BY name, id`,
  )
  const open = rows.filter((r) => !r.reviewed)
  const batches = batchByTags(open)
  const changing = batches.reduce((n, b) => n + b.ids.length, 0)
  const tagged = open.filter((r) => inferMuscles(r.name).primary.length > 0).length
  console.log(`${schema}: ${rows.length} exercises, ${rows.length - open.length} reviewed (left alone), ${tagged} of ${open.length} unreviewed get tags from the rules`)
  console.log(`${changing} row(s) to write in ${batches.length} update(s)${apply ? "" : present ? " (dry run, pass --apply)" : " (dry run: the columns do not exist yet, pass --apply)"}`)

  if (top > 0) {
    // Calibration view: the most programmed and logged exercises with the tags they would get.
    const used = await p.$queryRawUnsafe<{ id: string; uses: number }[]>(
      `SELECT id, COUNT(*)::int AS uses FROM (
         SELECT "exerciseId" AS id FROM "${schema}"."WorkoutExercise" WHERE "exerciseId" IS NOT NULL
         UNION ALL
         SELECT "exerciseId" AS id FROM "${schema}"."ExerciseLog" WHERE "exerciseId" IS NOT NULL
       ) u GROUP BY id ORDER BY uses DESC, id LIMIT $1`,
      top,
    )
    const byId = new Map(rows.map((r) => [r.id, r]))
    used.forEach((u, i) => {
      const r = byId.get(u.id)
      if (!r) return
      const t = r.reviewed ? r : inferMuscles(r.name)
      console.log(`${String(i + 1).padStart(4)}  ${String(u.uses).padStart(5)}  ${r.name}  ->  ${show(t)}${r.reviewed ? "  [reviewed]" : ""}`)
    })
  } else {
    // A sample of what --apply writes: two names from each of the first updates.
    const byId = new Map(open.map((r) => [r.id, r]))
    batches
      .flatMap((b) => b.ids.slice(0, 2).map((id) => ({ name: byId.get(id)!.name, tags: b })))
      .slice(0, 12)
      .forEach((s) => console.log(`  ${s.name}  ->  ${show(s.tags)}`))
  }

  if (!apply) return
  let n = 0
  for (const b of batches) {
    n += await p.$executeRawUnsafe(
      `UPDATE ${T} SET primary_muscles = $1::text[], secondary_muscles = $2::text[] WHERE id = ANY($3::text[]) AND muscles_reviewed_at IS NULL`,
      b.primary,
      b.secondary,
      b.ids,
    )
  }
  console.log(`wrote ${n} row(s)`)
}

main()
  .catch((e) => {
    console.log("ERR", String(e.message).split("\n").filter(Boolean).pop())
    process.exitCode = 1
  })
  .finally(() => p.$disconnect())
