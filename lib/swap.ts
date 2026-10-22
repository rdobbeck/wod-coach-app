import { groupLabel, isGroupId } from "@/lib/muscles/groups"

/**
 * Swap suggestions in a live session: library exercises that train the same
 * thing as the one on the screen, so a busy rack or a missing cable machine is
 * one tap, not a search.
 *
 * "The same thing" is the movement pattern (the library's CoachRx patterns:
 * Pull, Push, Squat, Lunge, Bend, Core...) and the primary muscles. Only
 * exercises with a demo video are offered, near-duplicate names collapse to
 * one, and what the coach actually programs ranks first.
 */
export type SwapTags = { patterns: string[]; primary: string[]; secondary: string[] }
export type SwapRow = SwapTags & { id: string; name: string; videoUrl: string | null; equipment: string[] }
export type Suggestion = { id: string; name: string; videoUrl: string; equipment: string[]; why: string }

export const foldName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
const lower = (xs: readonly string[]) => xs.map((x) => x.toLowerCase())

// Only used when the library has no pattern for the exercise at all.
const PATTERN_WORDS: [RegExp, string][] = [
  [/\b(jumps?|bounds?|hops?|skater)\b/i, "Plyometric"],
  [/\b(split squat|lunge|step ?up|step-up|bulgarian)\b/i, "Lunge"],
  [/\bsquat\b|\bleg press\b|\bwall sit\b/i, "Squat"],
  [/\b(deadlift|rdl|hinge|good morning|swing|hip thrust|glute bridge|back extension)\b/i, "Bend"],
  [/\b(row|pull[- ]?up|chin[- ]?up|pulldown|pull-down|lat pull|face pull|pullover)\b/i, "Pull"],
  [/\b(press|push[- ]?up|dip|fly|flye|bench)\b/i, "Push"],
  [/\b(plank|crunch|sit[- ]?up|dead bug|hollow|pallof|leg raise|rotation|twist|carry|ab wheel|rollout)\b/i, "Core"],
]
export const patternsFromName = (name: string) => {
  const hit = PATTERN_WORDS.find(([re]) => re.test(name))
  return hit ? [hit[1]] : []
}

/**
 * Up to `limit` swaps for `source`, best first. A candidate must share a
 * primary muscle, and when both sides have a pattern it must share that too,
 * so a lat exercise never suggests a curl and a squat never suggests a leg
 * extension's cousin from another pattern. With no muscles known, a shared
 * pattern is enough.
 */
export function rankSwaps(
  source: SwapTags & { name: string; id?: string | null },
  rows: readonly SwapRow[],
  uses: ReadonlyMap<string, number> = new Map(),
  limit = 8
): Suggestion[] {
  const self = foldName(source.name)
  const sp = new Set(lower(source.patterns))
  const sPrim = lower(source.primary)
  const sSec = new Set(lower(source.secondary))
  const best = new Map<string, { s: number; r: SwapRow; why: string }>()

  for (const r of rows) {
    if (!r.videoUrl || r.id === source.id) continue
    const key = foldName(r.name)
    if (!key || key === self) continue
    const rPat = lower(r.patterns)
    const rPrim = lower(r.primary)
    const pattern = rPat.find((p) => sp.has(p))
    const shared = rPrim.filter((m) => sPrim.includes(m))
    if (sPrim.length) {
      if (!shared.length) continue
      if (sp.size && rPat.length && !pattern) continue
    } else if (!pattern) continue

    const score =
      shared.length * 4 +
      (sPrim[0] && rPrim[0] === sPrim[0] ? 3 : 0) +
      (pattern ? 4 : 0) +
      lower(r.secondary).filter((m) => sSec.has(m) || sPrim.includes(m)).length +
      // Muscles the source doesn't train make it a different exercise.
      -rPrim.filter((m) => !sPrim.includes(m)).length * 1.5 +
      Math.log2(1 + (uses.get(r.id) ?? 0)) * 1.5 -
      (r.name.length > 40 ? 1 : 0)

    const labels = [pattern ? r.patterns.find((p) => p.toLowerCase() === pattern)! : null, ...shared.slice(0, 2).map((m) => (isGroupId(m) ? groupLabel(m) : m))]
    const prev = best.get(key)
    if (!prev || score > prev.s) best.set(key, { s: score, r, why: labels.filter(Boolean).join(" · ") })
  }

  // A swap is usually for a missing bar or rack, so at most three versions of the same lift
  // ("Weighted Pull-Up", "Strict Pull-Up"...) before other ways to train it.
  let variants = 0
  return Array.from(best.entries())
    .sort(([, a], [, b]) => b.s - a.s || a.r.name.length - b.r.name.length)
    .filter(([key]) => !(` ${key} `.includes(` ${self} `) || ` ${self} `.includes(` ${key} `)) || ++variants <= 3)
    .map(([, v]) => v)
    .slice(0, limit)
    .map(({ r, why }) => ({ id: r.id, name: r.name, videoUrl: r.videoUrl!, equipment: r.equipment, why }))
}
