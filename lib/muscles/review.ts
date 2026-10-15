import { exerciseKey } from "../exercise-key"
import { orderGroups, type GroupId } from "./groups"

export type ReviewTab = "todo" | "reviewed" | "untagged"
export type ReviewInput = { id: string; name: string; videoUrl: string | null; primaryMuscles: readonly string[]; secondaryMuscles: readonly string[]; musclesReviewedAt: Date | null }
export type ReviewRow = { id: string; name: string; videoUrl: string | null; primary: GroupId[]; secondary: GroupId[]; reviewed: boolean; uses: number }

/**
 * Ryan's review queue: one entry per exercise name, most used first. Rows sharing a name are one
 * entry: their uses add up, and a reviewed row stands for them when there is one (so the queue shows
 * his answer, not a newer duplicate's draft), else the most-used row. A save applies to all of them.
 * A name is reviewed only when all its rows are, so a duplicate added later comes back to the queue.
 * "todo" is every unreviewed name, "untagged" the unreviewed ones the rules left without tags.
 *
 * Pages follow a cursor, the id of the last entry shown: reviewing rows shrinks "todo", so a page
 * number would skip the names that move up.
 */
export function reviewList(
  rows: readonly ReviewInput[],
  uses: ReadonlyMap<string, number>,
  opts: { tab: ReviewTab; q?: string; after?: string | null; pageSize?: number; topN?: number },
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
    const reviewedWins = !!r.musclesReviewedAt && !seen.rep.musclesReviewedAt
    const sameStanding = !!r.musclesReviewedAt === !!seen.rep.musclesReviewedAt
    if (reviewedWins || (sameStanding && n > seen.best)) {
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
  const position = new Map(all.map((r, i) => [r.id, i]))
  const inTab = all.filter((r) => {
    const tabOk = opts.tab === "reviewed" ? r.reviewed : !r.reviewed && (opts.tab === "todo" || (!r.primary.length && !r.secondary.length))
    return tabOk && (!q || r.name.toLowerCase().includes(q))
  })
  const size = opts.pageSize ?? 50
  // Entries after the cursor's place in the whole list, which does not move when rows get reviewed.
  const from = opts.after ? position.get(opts.after) : undefined
  const rest = from === undefined ? inTab : inTab.filter((r) => (position.get(r.id) ?? -1) > from)
  const page = rest.slice(0, size)
  const next = rest.length > size ? page[page.length - 1].id : null
  return { rows: page, total: inTab.length, reviewedOfTop, topN, next }
}
