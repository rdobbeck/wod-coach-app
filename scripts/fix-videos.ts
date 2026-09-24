import { config } from "dotenv"
config({ path: ".env.local" })
import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient({ datasources: { db: { url: process.env.POSTGRES_URL_NON_POOLING! } } })

const APPLY = process.argv.includes("--apply")

// name -> replacement, each verified playable and titled for the right movement.
const FIX: Record<string, { to: string; why: string }> = {
  "Wall Walk (slow)": { to: "https://youtu.be/YfEKoyZ9Ljw", why: '"Wall Walk - OPEX Exercise Library"' },
  "Plank Drag-Through": { to: "https://www.youtube.com/watch?v=i04XHI0AAXg", why: '"Plank Drag Through" - The Active Life' },
  "Broad Jump": { to: "https://www.youtube.com/watch?v=AOkmLTD8J24", why: '"Broad Jump | Olympic Weightlifting Exercise Library" - Catalyst Athletics' },
}

async function main() {
  for (const [name, f] of Object.entries(FIX)) {
    const rows = await prisma.exerciseLibrary.findMany({
      where: { name, workoutExercises: { some: {} } },
      select: { id: true, name: true, videoUrl: true, locked: true, _count: { select: { workoutExercises: true } } },
    })
    for (const r of rows) {
      console.log(`${r.name}  [${r._count.workoutExercises}x]  locked=${r.locked}`)
      console.log(`   was: ${r.videoUrl}`)
      console.log(`   now: ${f.to}   ${f.why}`)
      if (APPLY) {
        await prisma.exerciseLibrary.update({ where: { id: r.id }, data: { videoUrl: f.to } })
        console.log("   ✓ written")
      }
    }
  }
  console.log(APPLY ? "\nAPPLIED" : "\nDRY RUN (pass --apply)")
}
main().finally(() => prisma.$disconnect())
