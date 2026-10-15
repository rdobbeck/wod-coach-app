import { exerciseKey } from "../exercise-key"
import { orderGroups, type GroupId } from "./groups"

export type ReviewTab = "todo" | "reviewed" | "untagged"
export type ReviewInput = { id: string; name: string; videoUrl: string | null; primaryMuscles: readonly string[]; secondaryMuscles: readonly string[]; musclesReviewedAt: Date | null }
export type ReviewRow = { id: string; name: string; videoUrl: string | null; primary: GroupId[]; secondary: GroupId[]; reviewed: boolean; uses: number }

/**
 * Ryan's review queue: one entry per exercise name, most used first. Rows sharing a name are one
 * entry: their uses add up and the most-used row stands for them (a save applies to all of them).
 * A name is reviewed only when all its rows are, so a duplicate added later comes back to the queue.
 * "todo" is every unreviewed name, "untagged" the unreviewed ones the rules left without tags.
 */
export function reviewList(
  rows: readonly ReviewInput[],
  uses: ReadonlyMap<string, number>,
  opts: { tab: ReviewTab; q?: string; page?: number; pageSize?: number; topN?: number },
) {
  const byName = new Map<string, { rep: ReviewInput; best: number; total: number; allReviewed: boolean }>()
  for (const r of rows) {
    const n = uses.get(r.id) ?? 0
    const key = exerciseKey(r.name)
    const seen = byName.get(key)
    if (!seen) {
      byName.set(key, { rep: r, best: n, total: n, allReviewed: !!r.musclesReviewedAt })
      continue
    }
    seen.total += n
    seen.allReviewed = seen.allReviewed && !!r.musclesReviewedAt
    if (n > seen.best) {
      seen.rep = r
      seen.best = n
    }
  }
  const all: ReviewRow[] = Array.from(byName.values())
    .map(({ rep, total, allReviewed }) => ({
      id: rep.id,
      name: rep.name,
      videoUrl: rep.videoUrl,
      primary: orderGroups(rep.primaryMuscles),
      secondary: orderGroups(rep.secondaryMuscles),
      reviewed: allReviewed,
      uses: total,
    }))
    .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1))
  const topN = Math.min(opts.topN ?? 300, all.length)
  const reviewedOfTop = all.slice(0, topN).filter((r) => r.reviewed).length
  const q = (opts.q ?? "").trim().toLowerCase()
  const inTab = all.filter((r) => {
    const tabOk = opts.tab === "reviewed" ? r.reviewed : !r.reviewed && (opts.tab === "todo" || (!r.primary.length && !r.secondary.length))
    return tabOk && (!q || r.name.toLowerCase().includes(q))
  })
  const size = opts.pageSize ?? 50
  const page = Math.max(1, opts.page ?? 1)
  return { rows: inTab.slice((page - 1) * size, page * size), total: inTab.length, reviewedOfTop, topN }
}
