import { prisma } from "@/lib/prisma"

let vocabCache: { at: number; list: string[] } | null = null
/** The 30 most used equipment words in the library, so the model tags with the words the filters use. */
export async function equipmentVocab(): Promise<string[]> {
  if (vocabCache && Date.now() - vocabCache.at < 10 * 60_000) return vocabCache.list
  const rows = await prisma.exerciseLibrary.findMany({ select: { equipment: true } })
  const counts = new Map<string, number>()
  for (const r of rows) for (const e of r.equipment) if (e.trim()) counts.set(e.trim(), (counts.get(e.trim()) ?? 0) + 1)
  const list = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 30)
    .map(([e]) => e)
  vocabCache = { at: Date.now(), list }
  return list
}
