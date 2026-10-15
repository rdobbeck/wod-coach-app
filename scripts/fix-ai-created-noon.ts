/**
 * One-off: sessions made by Ask AI's "create" before 2026-10-15 were stored at
 * midnight UTC instead of the app's noon-UTC convention. Move each to noon on
 * the same UTC day, and clear the "moved" mark a same-day save put on them.
 *
 *   npx tsx scripts/fix-ai-created-noon.ts --schema=public            # dry run, production
 *   npx tsx scripts/fix-ai-created-noon.ts --schema=public --apply    # write
 * --schema is required (public = production, preview = preview) so the target is never implied.
 */
import { config } from "dotenv"
config({ path: ".env.local", override: true })
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"

const apply = process.argv.includes("--apply")
const schemaArg = process.argv.find((a) => a.startsWith("--schema="))?.slice(9)
if (schemaArg !== "public" && schemaArg !== "preview") {
  console.error("Pass --schema=public or --schema=preview")
  process.exit(1)
}
if (schemaArg === "public") delete process.env.DB_SCHEMA
else process.env.DB_SCHEMA = "preview"
console.log(`target: ${schemaArg}${apply ? "" : " (dry run)"}`)
const p = new PrismaClient({ datasources: { db: { url: dbUrl() } } })
const noon = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T12:00:00.000Z`)

;(async () => {
  const sets = await p.aiChangeSet.findMany({ select: { applied: true } })
  const ids = sets.flatMap((s) => (s.applied as { action: string; workoutId?: string }[]).filter((a) => a.action === "create").map((a) => a.workoutId!))
  const ws = await p.workout.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, scheduledDate: true, originalDate: true } })
  let n = 0
  for (const w of ws) {
    const fixDate = w.scheduledDate.getUTCHours() === 0
    // A same-day "move" (original date on the same UTC day as now) is the artifact of saving a midnight row.
    const fixMoved = !!w.originalDate && w.originalDate.toISOString().slice(0, 10) === w.scheduledDate.toISOString().slice(0, 10)
    if (!fixDate && !fixMoved) continue
    n++
    console.log(`${w.id}  ${w.scheduledDate.toISOString()} -> ${noon(w.scheduledDate).toISOString()}${fixMoved ? "  (clear moved)" : ""}  ${w.name}`)
    if (apply) {
      await p.workout.update({
        where: { id: w.id },
        data: { scheduledDate: noon(w.scheduledDate), dayOfWeek: noon(w.scheduledDate).getUTCDay(), ...(fixMoved ? { originalDate: null, movedAt: null, movedById: null } : {}) },
      })
    }
  }
  console.log(`${n} session(s) ${apply ? "fixed" : "would be fixed (dry run)"}`)
  await p.$disconnect()
})()
