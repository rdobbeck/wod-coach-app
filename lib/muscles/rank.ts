import { exerciseKey } from "../exercise-key"
import { noLongDashes } from "../text"
import type { GroupId } from "./groups"

export type RankInput = { id: string; name: string; videoUrl: string | null; primaryMuscles: readonly string[]; secondaryMuscles: readonly string[] }
export type TrainRow = { id: string; name: string; videoUrl: string; role: "primary" | "secondary" }

/**
 * Train it's order for one group: exercises that work it as a primary muscle first, then as a
 * secondary one; within each, the most programmed and logged first, then by name. Only rows with a
 * video count. Rows sharing a name are one exercise: their uses add up, the most-used row stands in.
 * Names go out without long dashes: Train it is on public pages and clients' screens.
 */
export function rankForGroup(rows: readonly RankInput[], group: GroupId, uses: ReadonlyMap<string, number>, limit = 6): TrainRow[] {
  const byName = new Map<string, { row: TrainRow; best: number; total: number }>()
  for (const r of rows) {
    if (!r.videoUrl) continue
    const role = r.primaryMuscles.includes(group) ? "primary" : r.secondaryMuscles.includes(group) ? "secondary" : null
    if (!role) continue
    const n = uses.get(r.id) ?? 0
    const row: TrainRow = { id: r.id, name: noLongDashes(r.name), videoUrl: r.videoUrl, role }
    const key = exerciseKey(r.name)
    const seen = byName.get(key)
    if (!seen) {
      byName.set(key, { row, best: n, total: n })
      continue
    }
    seen.total += n
    if (n > seen.best) {
      seen.row = row
      seen.best = n
    }
  }
  return Array.from(byName.values())
    .sort((a, b) => Number(a.row.role === "secondary") - Number(b.row.role === "secondary") || b.total - a.total || a.row.name.localeCompare(b.row.name))
    .slice(0, limit)
    .map((x) => x.row)
}
