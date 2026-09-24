import { config } from "dotenv"
config({ path: ".env.local" })
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient({ datasources: { db: { url: process.env.POSTGRES_URL_NON_POOLING! } } })

const idOf = (u: string) => u.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/)?.[1] ?? ""

async function meta(url: string) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
    if (!r.ok) return { ok: false, title: "", author: "", err: `HTTP ${r.status}` }
    const j = (await r.json()) as { title: string; author_name: string }
    return { ok: true, title: j.title, author: j.author_name, err: "" }
  } catch (e) {
    return { ok: false, title: "", author: "", err: (e as Error).message }
  }
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w))
const STOP = new Set(["the", "and", "for", "with", "exercise", "library", "opex", "how", "demo", "tutorial", "video", "fitness", "your"])

async function main() {
  // Only what a client can actually open: exercises attached to a real workout.
  const rows = await prisma.exerciseLibrary.findMany({
    where: { workoutExercises: { some: {} } },
    select: { id: true, name: true, videoUrl: true, _count: { select: { workoutExercises: true } } },
    orderBy: { name: "asc" },
  })
  console.log(`exercises in use: ${rows.length}`)
  const missing = rows.filter((r) => !r.videoUrl)
  console.log(`no video at all: ${missing.length}`)

  const withVideo = rows.filter((r) => r.videoUrl)
  const bad: string[] = []
  const weak: string[] = []

  let i = 0
  const CONC = 6
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (i < withVideo.length) {
        const r = withVideo[i++]
        const url = r.videoUrl!
        const vid = idOf(url)
        if (vid.length !== 11) {
          bad.push(`MALFORMED ID (${vid.length} chars)  ${r.name}  [${r._count.workoutExercises}x]\n    ${url}`)
          continue
        }
        const m = await meta(url)
        if (!m.ok) {
          bad.push(`UNPLAYABLE (${m.err})  ${r.name}  [${r._count.workoutExercises}x]\n    ${url}`)
          continue
        }
        const nameWords = new Set(norm(r.name))
        const titleWords = new Set(norm(m.title))
        const hit = Array.from(nameWords).filter((w) => titleWords.has(w)).length
        const ratio = nameWords.size ? hit / nameWords.size : 1
        if (ratio < 0.34) {
          weak.push(`${(ratio * 100).toFixed(0)}%  ${r.name}  [${r._count.workoutExercises}x]\n    is: "${m.title}" — ${m.author}\n    ${url}`)
        }
      }
    })
  )

  console.log(`\n######## BROKEN (${bad.length}) ########`)
  bad.forEach((b) => console.log(b))
  console.log(`\n######## NAME DOES NOT MATCH VIDEO TITLE (${weak.length}) ########`)
  weak.sort().forEach((w) => console.log(w))
  console.log(`\n######## NO VIDEO (${missing.length}) ########`)
  missing.forEach((m) => console.log(`  ${m.name}  [${m._count.workoutExercises}x]`))
}
main().finally(() => prisma.$disconnect())
