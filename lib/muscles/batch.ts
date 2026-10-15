import { inferMuscles } from "./infer"

export type DraftRow = { id: string; name: string; primary: readonly string[]; secondary: readonly string[] }
export type Batch = { primary: string[]; secondary: string[]; ids: string[] }

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/**
 * The rollout script's writes: every row gets the name rules' draft, and rows ending up with the
 * same tags share one UPDATE. Rows already carrying their draft are skipped. The caller passes
 * unreviewed rows only.
 */
export function batchByTags(rows: readonly DraftRow[]): Batch[] {
  const byTags = new Map<string, Batch>()
  for (const r of rows) {
    const t = inferMuscles(r.name)
    if (same(t.primary, r.primary) && same(t.secondary, r.secondary)) continue
    const key = `${t.primary.join(",")}|${t.secondary.join(",")}`
    const b = byTags.get(key) ?? { primary: t.primary, secondary: t.secondary, ids: [] }
    b.ids.push(r.id)
    byTags.set(key, b)
  }
  return Array.from(byTags.values())
}
