export type Tags = { primary: string[]; secondary: string[] }
type LibraryTags = { name: string; primaryMuscles: string[]; secondaryMuscles: string[] }

const fold = (s: string) => s.trim().toLowerCase()

/** Names of workout rows with no library link, each once (ignoring case), for one same-name lookup. */
export function unlinkedNames(rows: readonly { name: string | null; exercise: unknown }[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of rows) {
    if (r.exercise || !r.name?.trim()) continue
    const k = fold(r.name)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r.name.trim())
  }
  return out
}

/**
 * The muscles one workout row shows: its library exercise's when it is linked, else those of a
 * tagged library exercise with the same name (ignoring case), else none. CoachRx imports that
 * matched no library row get chips this way.
 */
export function resolveMuscles(
  row: { name: string | null; exercise: { primaryMuscles: string[]; secondaryMuscles: string[] } | null },
  sameName: readonly LibraryTags[],
): Tags {
  if (row.exercise) return { primary: row.exercise.primaryMuscles, secondary: row.exercise.secondaryMuscles }
  const k = row.name ? fold(row.name) : ""
  const hit = k ? sameName.find((l) => fold(l.name) === k && l.primaryMuscles.length > 0) : undefined
  return hit ? { primary: hit.primaryMuscles, secondary: hit.secondaryMuscles } : { primary: [], secondary: [] }
}
