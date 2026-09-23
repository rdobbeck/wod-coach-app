'use client'

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { localDayKey } from "./MoveWorkoutButton"

type Move = { id: string; from: string; to: string; name: string }

const short = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })

/**
 * "Which days can you train this week?"
 *
 * The client ticks the days that work, sees exactly what would move before
 * anything changes, then commits. The preview matters: a reshuffle they did not
 * expect is worse than doing it by hand.
 */
export default function PlanWeekButton({ week, className = "" }: { week: string[]; className?: string }) {
  const router = useRouter()
  const today = localDayKey()
  // Only days still ahead can take a session.
  const usable = week.filter((d) => d >= today)

  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>(usable)
  const [preview, setPreview] = useState<{ sessions: number; moves: Move[] } | null>(null)
  const [busy, setBusy] = useState(false)

  const toggle = (d: string) => {
    setPreview(null)
    setPicked((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort()))
  }

  const call = async (dryRun: boolean) => {
    setBusy(true)
    const res = await fetch("/api/week/reflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: picked, today, dryRun }),
    })
    setBusy(false)
    if (!res.ok) {
      toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't reshape the week")
      return null
    }
    return res.json()
  }

  const check = async () => {
    const data = await call(true)
    if (data) setPreview(data)
  }

  const apply = async () => {
    const data = await call(false)
    if (!data) return
    toast.success(data.moved ? `Moved ${data.moved} ${data.moved === 1 ? "session" : "sessions"}` : "Nothing needed moving")
    setOpen(false)
    setPreview(null)
    router.refresh()
  }

  if (!usable.length) return null

  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>
        Plan my week
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-app-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <h2 className="font-display text-2xl font-bold">Which days can you train?</h2>
            <p className="mt-1 text-sm text-app-muted">Your sessions this week spread across the days you pick.</p>

            <div className="mt-4 grid grid-cols-4 gap-2">
              {usable.map((d) => {
                const on = picked.includes(d)
                return (
                  <button
                    key={d}
                    onClick={() => toggle(d)}
                    aria-pressed={on}
                    className={`rounded-xl border py-3 text-center ${on ? "border-app-accent bg-app-accent/10" : "border-app-border text-app-muted"}`}
                  >
                    <span className="block text-xs font-semibold uppercase">
                      {new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" })}
                    </span>
                    <span className="block font-display text-lg font-bold leading-none">
                      {new Date(`${d}T12:00:00`).getDate()}
                    </span>
                  </button>
                )
              })}
            </div>

            {preview && (
              <div className="mt-4 rounded-xl bg-app-surface2 p-3">
                {preview.moves.length === 0 ? (
                  <p className="text-sm text-app-muted">
                    {preview.sessions === 0 ? "Nothing left to do this week." : "Your sessions are already on those days."}
                  </p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {preview.moves.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold">{m.name}</span>
                        <span className="text-app-muted">
                          {short(m.from)} &rarr; {short(m.to)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setOpen(false)}
                className="h-12 flex-1 rounded-xl border border-app-border text-sm font-semibold text-app-text"
              >
                Cancel
              </button>
              {preview && preview.moves.length > 0 ? (
                <button
                  onClick={apply}
                  disabled={busy}
                  className="h-12 flex-1 rounded-xl bg-app-accent font-display text-lg font-bold uppercase tracking-[0.06em] text-app-accent-text disabled:opacity-60"
                >
                  {busy ? "Moving" : "Move them"}
                </button>
              ) : (
                <button
                  onClick={check}
                  disabled={busy || !picked.length}
                  className="h-12 flex-1 rounded-xl bg-app-accent font-display text-lg font-bold uppercase tracking-[0.06em] text-app-accent-text disabled:opacity-60 pulse-cta"
                >
                  {busy ? "Checking" : "Show me"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
