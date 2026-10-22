'use client'

import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { Suggestion } from "@/lib/swap"

export type Swapped = {
  id: string
  exerciseId: string | null
  name: string
  videoUrl: string | null
  libraryTracking: string | null
  lastTime: import("@/lib/training-format").HistoryEntry | null
}

/**
 * Swap one exercise mid-session, for the coach running it in person or the client on their own. Opens on
 * suggestions that train the same thing (lib/swap.ts), with a library search
 * under them for anything else. The prescription stays; sets already logged
 * on the old movement are cleared, and the sheet says so before it happens.
 */
export default function SwapSheet({
  workoutId,
  exercise,
  loggedSets,
  allowText = true,
  note = null,
  beforeSwap,
  onSwapped,
  onClose,
}: {
  workoutId: string
  exercise: { id: string; name: string }
  loggedSets: number
  /** Offer a text-only exercise (no video) at the end of a search. Coach only. */
  allowText?: boolean
  /** A line under the title, e.g. telling a client their coach is told. */
  note?: string | null
  /** Saves anything pending first, so an in-flight autosave can't land on the swapped row. */
  beforeSwap: () => Promise<boolean>
  onSwapped: (s: Swapped) => void
  onClose: () => void
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [q, setQ] = useState("")
  const [results, setResults] = useState<{ id: string; name: string; videoUrl: string | null }[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    // Cancelled when the sheet closes or re-runs, so a stale request never holds up the swap itself.
    const ctrl = new AbortController()
    fetch(`/api/workouts/${workoutId}/exercises/${exercise.id}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((d) => setSuggestions(d.suggestions ?? []))
      .catch((e) => {
        if (e.name !== "AbortError") setSuggestions([])
      })
    return () => ctrl.abort()
  }, [workoutId, exercise.id])

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/exercises/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => setResults(d.results ?? []))
        .catch((e) => {
          if (e.name !== "AbortError") setResults([])
        })
    }, 250)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const swap = async (pick: { id: string | null; name: string }) => {
    if (busy) return
    setBusy(pick.id ?? pick.name)
    await beforeSwap()
    const res = await fetch(`/api/workouts/${workoutId}/exercises/${exercise.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseId: pick.id, name: pick.name }),
    }).catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    setBusy(null)
    if (!res?.ok) return toast.error(d.error ?? "Couldn't swap that. Try again.")
    toast.success(`Swapped to ${d.name}`)
    onSwapped(d as Swapped)
  }

  const Row = ({ id, name, sub, video }: { id: string | null; name: string; sub?: string; video?: boolean }) => (
    <li>
      <button
        onClick={() => swap({ id, name })}
        disabled={!!busy}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-app-surface2 disabled:opacity-50"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{name}</span>
          {sub && <span className="block truncate text-xs text-app-muted">{sub}</span>}
        </span>
        {busy === (id ?? name) ? (
          <span className="shrink-0 text-xs text-app-muted">Swapping…</span>
        ) : (
          video && <span className="shrink-0 text-xs text-app-accent" aria-label="has a demo video">▶</span>
        )}
      </button>
    </li>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose} role="dialog" aria-label={`Swap ${exercise.name}`}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-3xl border border-app-border bg-app-surface pb-[env(safe-area-inset-bottom)] text-app-text"
      >
        <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-4">
          <div className="min-w-0">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-app-muted">Swap</p>
            <p className="truncate font-display text-2xl font-bold leading-tight">{exercise.name}</p>
            <p className="text-xs text-app-muted">Same sets, reps and rest. Only the movement changes.</p>
            {note && <p className="text-xs text-app-muted">{note}</p>}
          </div>
          <button onClick={onClose} className="shrink-0 rounded-full bg-app-surface2 px-4 py-2 text-sm font-semibold">
            Close
          </button>
        </div>
        {loggedSets > 0 && (
          <p className="mx-4 mb-2 rounded-xl bg-app-surface2 px-3 py-2 text-xs text-app-warn">
            {loggedSets} {loggedSets === 1 ? "set is" : "sets are"} logged on {exercise.name}. Swapping clears {loggedSets === 1 ? "it" : "them"}.
          </p>
        )}

        <div className="px-4 pb-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the library…"
            aria-label="Search the library"
            className="block w-full rounded-xl border border-app-border bg-app-bg px-3 py-2.5 text-base text-app-text placeholder:text-app-muted/70"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-4">
          {q.trim().length >= 2 ? (
            <ul>
              {results.map((r) => (
                <Row key={r.id} id={r.id} name={r.name} video={!!r.videoUrl} />
              ))}
              {allowText && <Row id={null} name={q.trim()} sub="As text only, no demo video" />}
            </ul>
          ) : (
            <>
              <p className="px-3 pb-1 pt-1 text-[0.625rem] font-bold uppercase tracking-[0.16em] text-app-muted">Same pattern and muscles</p>
              {suggestions === null ? (
                <p className="px-3 py-2 text-sm text-app-muted">Finding swaps…</p>
              ) : suggestions.length ? (
                <ul data-testid="swap-suggestions">
                  {suggestions.map((s) => (
                    <Row key={s.id} id={s.id} name={s.name} sub={[s.why, s.equipment.slice(0, 2).join(", ")].filter(Boolean).join(" · ")} video />
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-2 text-sm text-app-muted">No close matches in the library. Search for one above.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
