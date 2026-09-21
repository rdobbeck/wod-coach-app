'use client'

import Link from "next/link"
import { useEffect, useState } from "react"
import MoveWorkoutButton, { localDayKey } from "./MoveWorkoutButton"

export type DayWorkout = {
  id: string
  day: string
  name: string
  programName: string | null
  isCompleted: boolean
  isRest: boolean
  exerciseNames: string[]
  movedFrom: string | null
}

const shortDate = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })

function WorkoutCard({ w, canMove, highlight }: { w: DayWorkout; canMove: boolean; highlight?: boolean }) {
  if (w.isRest) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <p className="text-lg font-bold text-gray-900">Rest day</p>
        <p className="mt-1 text-sm text-gray-500">Recover well. See you next session.</p>
      </div>
    )
  }
  return (
    <div className={`rounded-2xl border bg-white p-5 ${highlight ? "border-primary-200 shadow-sm" : "border-gray-200"}`}>
      {w.programName && <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{w.programName}</p>}
      <p className="mt-1 text-xl font-bold text-gray-900">{w.name}</p>
      {w.movedFrom && <p className="mt-1 text-xs text-gray-500">Moved from {shortDate(w.movedFrom)}</p>}
      <ul className="mt-3 space-y-1 text-sm text-gray-700">
        {w.exerciseNames.slice(0, 4).map((n, i) => (
          <li key={i} className="truncate">• {n}</li>
        ))}
        {w.exerciseNames.length > 4 && <li className="text-gray-500">+ {w.exerciseNames.length - 4} more</li>}
      </ul>
      <div className="mt-4 flex items-center gap-3">
        <Link
          href={`/client/workouts/${w.id}`}
          className={`flex-1 rounded-xl py-3 text-center text-base font-bold ${
            w.isCompleted ? "bg-green-50 text-green-700" : "bg-primary-600 text-white"
          }`}
        >
          {w.isCompleted ? "Done ✓ View" : "Start"}
        </Link>
        {canMove && !w.isCompleted && <MoveWorkoutButton workoutId={w.id} currentDay={w.day} className="px-3 py-3 text-sm font-semibold text-primary-600" />}
      </div>
    </div>
  )
}

export default function TodayView({
  firstName,
  coachName,
  canMove,
  workouts,
}: {
  firstName: string
  coachName: string | null
  canMove: boolean
  workouts: DayWorkout[]
}) {
  // "Today" is the client's local day, so it's computed in the browser.
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => setToday(localDayKey()), [])
  if (!today) return null

  const todays = workouts.filter((w) => w.day === today)
  const upcoming = workouts.find((w) => w.day > today && !w.isRest)
  const weekAgo = localDayKey(new Date(Date.now() - 7 * 86_400_000))
  const missed = workouts.filter((w) => w.day < today && w.day >= weekAgo && !w.isCompleted && !w.isRest)

  // Mon-Sun strip for the current week
  const monday = new Date(`${today}T12:00:00`)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const key = localDayKey(d)
    const ws = workouts.filter((w) => w.day === key && !w.isRest)
    const status = !ws.length ? "none" : ws.every((w) => w.isCompleted) ? "done" : key < today ? "missed" : "planned"
    return { key, letter: d.toLocaleDateString("en-US", { weekday: "narrow" }), date: d.getDate(), status }
  })

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-gray-500">
          {new Date(`${today}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="text-2xl font-bold text-gray-900">Hi {firstName}</h1>
        {coachName && <p className="text-sm text-gray-500">Coach: {coachName}</p>}
      </header>

      <div className="grid grid-cols-7 gap-1 rounded-2xl bg-white p-2 border border-gray-200">
        {week.map((d) => (
          <div key={d.key} className={`flex flex-col items-center rounded-xl py-2 ${d.key === today ? "bg-primary-50" : ""}`}>
            <span className="text-[11px] font-semibold text-gray-500">{d.letter}</span>
            <span className={`text-sm font-bold ${d.key === today ? "text-primary-700" : "text-gray-900"}`}>{d.date}</span>
            <span
              className={`mt-1 h-2 w-2 rounded-full ${
                d.status === "done" ? "bg-green-500" : d.status === "missed" ? "bg-red-400" : d.status === "planned" ? "bg-primary-400" : "bg-transparent"
              }`}
            />
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Today</h2>
        {todays.length ? (
          todays.map((w) => <WorkoutCard key={w.id} w={w} canMove={canMove} highlight />)
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-300 p-5 text-sm text-gray-600">
            Nothing scheduled today.
            {upcoming && <> Next up: <span className="font-semibold">{upcoming.name}</span> on {shortDate(upcoming.day)}.</>}
          </div>
        )}
      </section>

      {missed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Missed this week</h2>
          {missed.map((w) => (
            <div key={w.id} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3">
              <Link href={`/client/workouts/${w.id}`} className="min-w-0">
                <p className="truncate font-semibold text-gray-900">{w.name}</p>
                <p className="text-xs text-gray-500">{shortDate(w.day)}</p>
              </Link>
              {canMove && <MoveWorkoutButton workoutId={w.id} currentDay={w.day} />}
            </div>
          ))}
        </section>
      )}

      {!todays.length && upcoming && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Up next · {shortDate(upcoming.day)}</h2>
          <WorkoutCard w={upcoming} canMove={canMove} />
        </section>
      )}
    </div>
  )
}
