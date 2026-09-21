// Pure helpers shared by server code and client components (no database imports).

/** Calendar day key ("2026-09-21") for a stored workout date. Workouts are stored at noon UTC. */
export const dayKey = (d: Date) => d.toISOString().slice(0, 10)

/** Parse a "YYYY-MM-DD" day into the stored representation (noon UTC). */
export const fromDayKey = (key: string) => new Date(`${key}T12:00:00.000Z`)

export type HistoryEntry = {
  id: string
  date: string
  workoutId: string
  workoutName: string
  exerciseName: string
  resultText: string | null
  rpe: number | null
  sets: { setNumber: number; reps: number | null; weight: number | null; rpe: number | null }[]
}

/** One-line summary of a history entry: "40 kg × 8 · 45 × 8 · RPE 7" or the result text. */
export function summarizeEntry(h: Pick<HistoryEntry, "resultText" | "rpe" | "sets">, units = "lb") {
  // Collapse repeats: "110 lb × 6 (×3) · 120 lb × 6"
  const sets: string[] = []
  let prev = ""
  let run = 0
  const push = () => prev && sets.push(run > 1 ? `${prev} (×${run})` : prev)
  for (const s of h.sets.filter((s) => s.reps !== null || s.weight !== null)) {
    const txt = [s.weight !== null ? `${s.weight} ${units}` : null, s.reps !== null ? `${s.reps}` : null].filter(Boolean).join(" × ")
    if (txt === prev) run++
    else {
      push()
      prev = txt
      run = 1
    }
  }
  push()
  const parts = sets.length ? [sets.join(" · ")] : h.resultText ? [h.resultText] : []
  if (h.rpe !== null) parts.push(`RPE ${h.rpe}`)
  return parts.join(" · ")
}
