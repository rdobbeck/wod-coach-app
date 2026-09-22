'use client'

import Link from "next/link"
import { useState } from "react"
import ExerciseHistorySheet from "@/components/ExerciseHistorySheet"
import { summarizeEntry } from "@/lib/training-format"

type W = { id: string; name: string; day: string; programName: string | null; exerciseCount: number }
type X = {
  exerciseId: string | null
  name: string
  lastDay: string
  count: number
  last: { resultText: string | null; rpe: number | null; sets: { setNumber: number; reps: number | null; weight: number | null; rpe: number | null }[] }
}

const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" })

export default function HistoryView({
  workouts,
  exercises,
  units,
  clientId,
  workoutBase = "/client/workouts/",
  initialTab = "workouts",
  title = "History",
}: {
  workouts: W[]
  exercises: X[]
  units: string
  clientId?: string // set when a coach is viewing a client
  workoutBase?: string // link prefix for a workout id (strings only: this is rendered from server pages)
  initialTab?: "workouts" | "exercises"
  title?: string | null
}) {
  const [tab, setTab] = useState<"workouts" | "exercises">(initialTab)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState<X | null>(null)
  const shown = exercises.filter((x) => x.name.toLowerCase().includes(query.toLowerCase()))

  // Group workouts by month for scanning.
  const months: { label: string; items: W[] }[] = []
  for (const w of workouts) {
    const label = fmt(w.day, { month: "long", year: "numeric" })
    if (months[months.length - 1]?.label !== label) months.push({ label, items: [] })
    months[months.length - 1].items.push(w)
  }

  return (
    <div className="space-y-4">
      {title && <h1 className="font-display text-4xl font-bold">{title}</h1>}
      <div className="grid grid-cols-2 rounded-xl bg-app-surface2 p-1 text-sm font-semibold">
        {(["workouts", "exercises"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg py-2 capitalize ${tab === t ? "bg-app-surface text-app-text shadow-sm" : "text-app-muted"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "workouts" &&
        (workouts.length ? (
          months.map((m) => (
            <section key={m.label} className="space-y-2">
              <h2 className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-app-muted">{m.label}</h2>
              {m.items.map((w) => (
                <Link key={w.id} href={`${workoutBase}${w.id}`} className="block rounded-2xl border border-app-border bg-app-surface px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate font-display text-xl font-semibold">{w.name}</p>
                    <span className="shrink-0 text-xs text-app-muted">{fmt(w.day, { weekday: "short", month: "short", day: "numeric" })}</span>
                  </div>
                  <p className="text-xs text-app-muted">{[w.programName, `${w.exerciseCount} exercises`].filter(Boolean).join(" · ")}</p>
                </Link>
              ))}
            </section>
          ))
        ) : (
          <p className="text-sm text-app-muted">No completed workouts yet.</p>
        ))}

      {tab === "exercises" && (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercises"
            className="block w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-base text-app-text placeholder:text-app-muted/70"
          />
          {shown.length ? (
            <ul className="space-y-2">
              {shown.map((x) => (
                <li key={x.exerciseId ?? x.name}>
                  <button onClick={() => setOpen(x)} className="block w-full rounded-2xl border border-app-border bg-app-surface px-4 py-3 text-left">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate font-display text-xl font-semibold">{x.name}</p>
                      <span className="shrink-0 text-xs text-app-muted">{x.count}×</span>
                    </div>
                    <p className="truncate text-xs text-app-muted">
                      {fmt(x.lastDay, { month: "short", day: "numeric" })} · {summarizeEntry(x.last, units) || "done"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-app-muted">{exercises.length ? "No matches." : "Nothing logged yet."}</p>
          )}
        </>
      )}

      {open && <ExerciseHistorySheet clientId={clientId} exerciseId={open.exerciseId} name={open.name} units={units} onClose={() => setOpen(null)} />}
    </div>
  )
}
