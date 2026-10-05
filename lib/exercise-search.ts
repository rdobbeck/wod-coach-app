/**
 * Ranking for the coach exercise picker. Every library match is ranked here
 * BEFORE the list is cut, so "Front Squat" is never pushed out by forty
 * alphabetically earlier names like "Front Rack Lunge" or "Axle Bar Front Squat".
 */
type Row = { name: string; videoUrl: string | null }

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()

/** 0 = exact name, 1 = name starts with the query, 2 = query appears as a phrase, 3 = words scattered. */
function tier(name: string, q: string): number {
  const n = norm(name)
  if (n === q) return 0
  if (n.startsWith(q)) return 1
  if (n.includes(q)) return 2
  return 3
}

export function rankExercises<T extends Row>(query: string, rows: T[], limit = 20): T[] {
  const q = norm(query)
  return rows
    .map((r) => ({ r, t: tier(r.name, q) }))
    .sort(
      (a, b) =>
        a.t - b.t ||
        Number(!!b.r.videoUrl) - Number(!!a.r.videoUrl) ||
        a.r.name.length - b.r.name.length ||
        a.r.name.localeCompare(b.r.name),
    )
    .slice(0, limit)
    .map((x) => x.r)
}
