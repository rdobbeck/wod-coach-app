import type { PrismaClient } from "@prisma/client"
import { exerciseKey } from "./exercise-key"

/** "KB Deadlift — Bilateral" / "Push-Up, Feet Elevated" -> the movement before the qualifier. */
export const baseName = (name: string) => name.split(/\s[—–-]\s|,|\s\(/)[0]

// Common names -> the name Ryan's library uses.
const ALIASES: Record<string, string> = {
  "overhead press": "strict press",
  "military press": "strict press",
  "ohp": "strict press",
  "barbell overhead press": "strict press",
  "standing overhead press": "strict press",
  "rdl": "romanian deadlift",
  "db": "dumbbell",
  "negative": "eccentric", // "Handstand Push-Up Negative" -> "Eccentric Handstand Push-Up"
  "negatives": "eccentric",
}

// The only words a fuzzy match may add: ones that don't change the movement.
// ("Barbell Row" -> "Bent Over Barbell Row" is fine; -> "Barbell Upright Row" is not.)
const NEUTRAL_EXTRA = new Set(["bent", "over", "bench", "flat", "standing", "conventional", "bilateral", "two", "arm", "the", "with", "barbell"])

/**
 * Build a name -> ExerciseLibrary id matcher. Tries, in order: `preferred`
 * (caller-supplied exact picks, e.g. CoachRx template choices), exact normalized
 * name, name without parentheses, then the base movement name. Among duplicate
 * names, entries with a video win, then Ryan's own (custom) entries.
 */
export async function buildExerciseMatcher(prisma: PrismaClient, preferred?: Map<string, string>) {
  const rows = await prisma.exerciseLibrary.findMany({
    select: { id: true, name: true, videoUrl: true, isCustom: true },
  })
  rows.sort((a, b) => Number(!!b.videoUrl) - Number(!!a.videoUrl) || Number(b.isCustom) - Number(a.isCustom))
  const exact = new Map<string, string>()
  const loose = new Map<string, string>()
  const names = new Map<string, string>()
  for (const r of rows) {
    names.set(r.id, r.name)
    const k = exerciseKey(r.name)
    if (!exact.has(k)) exact.set(k, r.id)
    const l = exerciseKey(r.name, true)
    if (!loose.has(l)) loose.set(l, r.id)
  }
  const tokenized = rows.map((r) => ({ id: r.id, tokens: new Set(exerciseKey(r.name, true).split(" ")), hasVideo: !!r.videoUrl }))

  /** Every query word is in the library name, and any extra words are movement-neutral (<= 2). */
  const subset = (key: string): string | null => {
    const q = key.split(" ").filter(Boolean)
    if (q.length < 2) return null
    let best: { id: string; extra: number; hasVideo: boolean } | null = null
    for (const r of tokenized) {
      if (!q.every((t) => r.tokens.has(t))) continue
      const extra = Array.from(r.tokens).filter((t) => !q.includes(t))
      if (extra.length > 2 || extra.some((t) => !NEUTRAL_EXTRA.has(t))) continue
      if (!best || extra.length < best.extra || (extra.length === best.extra && r.hasVideo && !best.hasVideo)) {
        best = { id: r.id, extra: extra.length, hasVideo: r.hasVideo }
      }
    }
    return best?.id ?? null
  }

  const aliased = (name: string) => {
    const k = exerciseKey(name, true)
    return ALIASES[k] ?? k.split(" ").map((t) => ALIASES[t] ?? t).join(" ")
  }

  const match = (name: string): string | null =>
    preferred?.get(exerciseKey(name)) ??
    exact.get(exerciseKey(name)) ??
    loose.get(exerciseKey(name, true)) ??
    exact.get(aliased(name)) ??
    exact.get(exerciseKey(baseName(name))) ??
    subset(aliased(name)) ??
    null
  return Object.assign(match, { libraryName: (id: string) => names.get(id) ?? null, size: rows.length })
}
