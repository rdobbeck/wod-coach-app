import { config } from "dotenv"
config({ path: ".env.local" })
import { writeFileSync } from "node:fs"
import { PrismaClient } from "@prisma/client"

/**
 * Read-only. Groups library exercises whose names are the same once case and
 * punctuation are ignored, picks one to keep per group, and says which video it
 * should carry. Writes the plan to the path given; changes nothing.
 *
 * Keep: the row already used most (fewest workouts to repoint).
 * Video: the best playable one in the group, OPEX first, then anything whose
 * title matches the name.
 */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.POSTGRES_URL_NON_POOLING! } } })
const OUT = process.argv[2]
if (!OUT) throw new Error("usage: plan-library-dedupe.ts <out.json>")

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2))
const vid = (u: string) => u.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/)?.[1] ?? ""

type Meta = { ok: boolean; title: string; author: string }
const cache = new Map<string, Meta>()
async function meta(url: string): Promise<Meta> {
  if (cache.has(url)) return cache.get(url)!
  let m: Meta = { ok: false, title: "", author: "" }
  if (vid(url).length === 11 || !/youtu/.test(url)) {
    try {
      const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
      if (r.ok) {
        const j = (await r.json()) as { title: string; author_name: string }
        m = { ok: true, title: j.title, author: j.author_name }
      }
    } catch {}
  }
  cache.set(url, m)
  return m
}

function score(name: string, m: Meta) {
  if (!m.ok) return -1
  const n = words(name)
  const t = words(m.title)
  const match = n.size ? Array.from(n).filter((w) => t.has(w)).length / n.size : 0
  return (/opex/i.test(m.author) ? 20 : 0) + Math.round(match * 10)
}

async function main() {
  const rows = await prisma.exerciseLibrary.findMany({
    select: {
      id: true, name: true, videoUrl: true, isCustom: true, coachrxId: true, locked: true,
      _count: { select: { workoutExercises: true, exerciseLogs: true } },
    },
  })
  const groups = new Map<string, typeof rows>()
  for (const r of rows) groups.set(key(r.name), [...(groups.get(key(r.name)) ?? []), r])
  const dupes = Array.from(groups.values()).filter((g) => g.length > 1)

  // Check every distinct video that appears in a duplicate group.
  const urls = Array.from(new Set(dupes.flat().map((r) => r.videoUrl).filter(Boolean) as string[]))
  let i = 0
  await Promise.all(Array.from({ length: 6 }, async () => { while (i < urls.length) await meta(urls[i++]) }))

  const plan = dupes.map((g) => {
    const keep = [...g].sort((a, b) => (b._count.workoutExercises + b._count.exerciseLogs) - (a._count.workoutExercises + a._count.exerciseLogs))[0]
    const videos = Array.from(new Set(g.map((r) => r.videoUrl).filter(Boolean) as string[]))
      .map((u) => ({ url: u, ...cache.get(u)!, score: score(keep.name, cache.get(u)!) }))
      .sort((a, b) => b.score - a.score)
    const best = videos.find((v) => v.ok) ?? null
    const used = g.reduce((a, r) => a + r._count.workoutExercises, 0)
    return {
      name: keep.name,
      keepId: keep.id,
      removeIds: g.filter((r) => r.id !== keep.id).map((r) => r.id),
      copies: g.length,
      usedInWorkouts: used,
      currentVideo: keep.videoUrl,
      currentVideoOk: keep.videoUrl ? cache.get(keep.videoUrl)?.ok ?? false : false,
      newVideo: best?.url ?? null,
      newVideoTitle: best ? `${best.title} (${best.author})` : null,
      videoChanges: !!best && best.url !== keep.videoUrl,
      allVideos: videos.map((v) => ({ url: v.url, ok: v.ok, title: v.title, author: v.author })),
      coachrxSynced: g.some((r) => r.coachrxId),
    }
  })

  writeFileSync(OUT, JSON.stringify(plan, null, 2))
  const s = {
    libraryRows: rows.length,
    duplicateGroups: plan.length,
    rowsToRemove: plan.reduce((a, p) => a + p.removeIds.length, 0),
    groupsUsedByClients: plan.filter((p) => p.usedInWorkouts > 0).length,
    videoChangesOnUsedExercises: plan.filter((p) => p.usedInWorkouts > 0 && p.videoChanges).length,
    groupsWithNoPlayableVideo: plan.filter((p) => !p.newVideo).length,
    groupsTouchingCoachrxSynced: plan.filter((p) => p.coachrxSynced).length,
  }
  console.log(s)
}
main().finally(() => prisma.$disconnect())
