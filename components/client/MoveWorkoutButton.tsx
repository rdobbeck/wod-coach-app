'use client'

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

// Local calendar day as YYYY-MM-DD (the client's today, not the server's).
export const localDayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

const dayLabel = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })

/** "Move" control: pick today or one of the next days (or any date) for a workout. */
export default function MoveWorkoutButton({
  workoutId,
  currentDay,
  className = "",
  label = "Move",
  quickTo,
}: {
  workoutId: string
  currentDay: string
  className?: string
  label?: string
  /** When set, the button moves straight to this day instead of opening the picker. */
  quickTo?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const today = localDayKey()
  const quick = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return localDayKey(d)
  }).filter((k) => k !== currentDay)

  const move = async (date: string) => {
    setSaving(true)
    const res = await fetch(`/api/workouts/${workoutId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, today }),
    })
    setSaving(false)
    if (!res.ok) {
      toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't move workout")
      return
    }
    toast.success(`Moved to ${dayLabel(date)}`)
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => (quickTo ? move(quickTo) : setOpen(true))}
        disabled={saving}
        className={className || "text-sm font-semibold text-app-accent"}
      >
        {saving ? "…" : label}
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div
            data-app-theme
            className="w-full max-w-md rounded-t-2xl border-t border-app-border bg-app-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] font-sans text-app-text"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-2xl font-bold">Move workout to…</h2>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {quick.map((k) => (
                <button
                  key={k}
                  disabled={saving}
                  onClick={() => move(k)}
                  className="rounded-xl border border-app-border px-3 py-3 text-sm font-semibold text-app-text disabled:opacity-50"
                >
                  {k === today ? "Today" : dayLabel(k)}
                </button>
              ))}
            </div>
            <label className="mt-4 block text-sm text-app-muted">
              Another day
              <input
                type="date"
                min={today}
                disabled={saving}
                onChange={(e) => e.target.value && move(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-app-text"
              />
            </label>
            <button onClick={() => setOpen(false)} className="mt-4 w-full py-2 text-sm font-medium text-app-muted">
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}
