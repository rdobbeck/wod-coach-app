'use client'

import { useEffect, useState } from "react"
import { summarizeEntry, type HistoryEntry } from "@/lib/training-format"

type Props = {
  clientId?: string // omit for the signed-in client
  exerciseId: string | null
  name: string
  units: string
  onClose: () => void
}

const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })

/** Bottom sheet listing every previous time the client did this exercise, newest first. */
export default function ExerciseHistorySheet({ clientId, exerciseId, name, units, onClose }: Props) {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    const q = new URLSearchParams({ name })
    if (exerciseId) q.set("exerciseId", exerciseId)
    if (clientId) q.set("clientId", clientId)
    fetch(`/api/exercise-history?${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((d) => setHistory(d.history))
      .catch(() => setError("Couldn't load history"))
  }, [clientId, exerciseId, name])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        data-app-theme
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl border-t border-app-border bg-app-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] font-sans text-app-text"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-app-muted">History</p>
            <h2 className="font-display text-2xl font-bold">{name}</h2>
          </div>
          <button onClick={onClose} className="rounded-full px-3 py-1 text-sm font-medium text-app-muted">
            Close
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {!history && !error && <p className="mt-4 text-sm text-app-muted">Loading…</p>}
        {history && history.length === 0 && <p className="mt-4 text-sm text-app-muted">No history yet for this exercise.</p>}

        {history && history.length > 0 && (
          <ul className="mt-4 divide-y divide-app-border">
            {history.map((h) => (
              <li key={h.id} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold">{fmtDate(h.date)}</span>
                  <span className="truncate text-xs text-app-muted">{h.workoutName}</span>
                </div>
                {h.sets.length > 0 ? (
                  <ul className="mt-1 text-sm">
                    {h.sets.map((s) => (
                      <li key={s.setNumber}>
                        Set {s.setNumber}: {s.weight !== null ? `${s.weight} ${units}` : "-"}
                        {s.reps !== null ? ` × ${s.reps}` : ""}
                        {s.rpe !== null ? ` @ RPE ${s.rpe}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {(h.resultText || (h.sets.length === 0 && h.rpe !== null)) && (
                  <p className="mt-1 whitespace-pre-line text-sm">
                    {summarizeEntry({ ...h, sets: [] }, units)}
                  </p>
                )}
                {h.sets.length > 0 && h.rpe !== null && <p className="text-xs text-app-muted">Overall RPE {h.rpe}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
