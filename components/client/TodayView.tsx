'use client'

import Link from "next/link"
import { useEffect, useState } from "react"
import MoveWorkoutButton, { localDayKey } from "./MoveWorkoutButton"
import FastingCard from "./FastingCard"
import type { FastEntry } from "@/lib/fasting"

export type DayWorkout = {
  id: string
  day: string
  name: string
  programName: string | null
  programWeek: number | null
  isCompleted: boolean
  isRest: boolean
  exerciseNames: string[]
  movedFrom: string | null
}
type Note = { author: string; body: string; workoutId: string; day: string }
type Fasting = {
  protocol: string
  targetHours: number
  windowStart: string
  windowEnd: string
  openFast: FastEntry | null
  recent: FastEntry[]
}

const shortDate = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })

function SessionCard({ w, canMove, primary }: { w: DayWorkout; canMove: boolean; primary?: boolean }) {
  if (w.isRest) {
    return (
      <div className="rounded-2xl border border-app-border bg-app-surface p-5">
        <p className="font-display text-2xl font-bold">Rest day</p>
        <p className="mt-1 text-sm text-app-muted">Recover well. See you next session.</p>
      </div>
    )
  }
  return (
    <div className={`overflow-hidden rounded-2xl border bg-app-surface ${primary ? "border-app-accent/60" : "border-app-border"}`}>
      <div className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {w.programName && <span className="font-display font-semibold uppercase tracking-[0.16em] text-app-accent">{w.programName}</span>}
          {w.programWeek && <span className="text-app-muted">· Week {w.programWeek}</span>}
          {w.movedFrom && <span className="text-app-muted">· moved from {shortDate(w.movedFrom)}</span>}
        </div>
        <h3 className="font-display text-3xl font-bold leading-none">{w.name}</h3>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-app-surface2 px-2.5 py-1 text-xs font-semibold text-app-text/80">{w.exerciseNames.length} exercises</span>
          {w.exerciseNames.slice(0, 2).map((n, i) => (
            <span key={i} className="max-w-[9rem] truncate rounded-full bg-app-surface2 px-2.5 py-1 text-xs font-semibold text-app-text/80">{n}</span>
          ))}
        </div>
        <div className="mt-1 flex items-center gap-3">
          <Link
            href={`/client/workouts/${w.id}`}
            className={`flex h-14 flex-1 items-center justify-center rounded-xl font-display text-xl font-bold uppercase tracking-[0.06em] ${
              w.isCompleted ? "bg-app-good text-white" : "bg-app-accent text-app-accent-text"
            }`}
          >
            {w.isCompleted ? "Done ✓ View" : "Start session"}
          </Link>
          {canMove && !w.isCompleted && (
            <MoveWorkoutButton
              workoutId={w.id}
              currentDay={w.day}
              className="h-14 rounded-xl border border-app-border px-4 text-sm font-semibold text-app-text"
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** Book a video call with the coach. Only rendered when they have a booking link. */
function BookCallCard({ coachName }: { coachName: string | null }) {
  return (
    <Link href="/client/book" className="flex items-center gap-3 rounded-2xl border border-app-border bg-app-surface px-4 py-3.5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-surface2">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-xl font-bold leading-tight">Book a call</span>
        <span className="block text-sm text-app-muted">Pick a time with {coachName ?? "your coach"}</span>
      </span>
      <span className="shrink-0 text-app-muted" aria-hidden="true">
        &rarr;
      </span>
    </Link>
  )
}

/** Link out to breathWOD, Ryan's breathwork trainer, which lives at its own app. */
function BreathwodCard() {
  return (
    <a
      href="https://breathwod.app"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-2xl border border-app-border bg-app-surface px-4 py-3.5"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-surface2">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 20c3.5 0 6-2.2 6-5.2 0-3.6-3.4-6-6-10.8-2.6 4.8-6 7.2-6 10.8C6 17.8 8.5 20 12 20z" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-xl font-bold leading-tight">breathWOD</span>
        <span className="block text-sm text-app-muted">Breathwork protocol trainer</span>
      </span>
      <span className="shrink-0 text-app-muted" aria-hidden="true">
        &rarr;
      </span>
    </a>
  )
}

export default function TodayView({
  firstName,
  coachName,
  canMove,
  compliance,
  workouts,
  latestNote,
  fasting,
  canBook,
}: {
  firstName: string
  coachName: string | null
  canMove: boolean
  compliance: number | null
  workouts: DayWorkout[]
  latestNote: Note | null
  fasting: Fasting | null
  canBook: boolean
}) {
  // "Today" is the client's local day, so it's computed in the browser.
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => setToday(localDayKey()), [])
  if (!today) return null

  const todays = workouts.filter((w) => w.day === today)
  const upcoming = workouts.find((w) => w.day > today && !w.isRest)
  const weekAgo = localDayKey(new Date(Date.now() - 7 * 86_400_000))
  const missed = workouts.filter((w) => w.day < today && w.day >= weekAgo && !w.isCompleted && !w.isRest)

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
  const bar = { done: "bg-app-good", missed: "bg-app-warn", planned: "bg-app-muted/50", none: "bg-transparent" }

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-app-muted">
            {new Date(`${today}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h1 className="font-display text-4xl font-bold leading-none">Hi {firstName}</h1>
          {coachName && <p className="mt-1 text-sm text-app-muted">Coach: {coachName}</p>}
        </div>
        {compliance !== null && (
          <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-2 border-app-accent">
            <span className="font-display text-xl font-bold leading-none">{compliance}%</span>
            <span className="text-[9px] uppercase tracking-[0.08em] text-app-muted">90 days</span>
          </div>
        )}
      </header>

      <div className="flex gap-1.5">
        {week.map((d) => (
          <div
            key={d.key}
            className={`flex flex-1 flex-col items-center gap-1.5 rounded-xl py-2 ${d.key === today ? "bg-app-accent text-app-accent-text" : "bg-app-surface"}`}
          >
            <span className={`text-[11px] font-semibold ${d.key === today ? "text-app-accent-text/80" : "text-app-muted"}`}>{d.letter}</span>
            <span className="font-display text-lg font-semibold leading-none">{d.date}</span>
            <span className={`h-[3px] w-4 rounded-full ${d.key === today ? "bg-app-accent-text" : bar[d.status as keyof typeof bar]}`} />
          </div>
        ))}
      </div>

      {fasting && (
        <FastingCard
          protocol={fasting.protocol}
          targetHours={fasting.targetHours}
          windowStart={fasting.windowStart}
          windowEnd={fasting.windowEnd}
          openFast={fasting.openFast}
          recent={fasting.recent}
        />
      )}

      <section className="space-y-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-app-muted">Today</h2>
        {todays.length ? (
          todays.map((w) => <SessionCard key={w.id} w={w} canMove={canMove} primary />)
        ) : (
          <div className="rounded-2xl border border-dashed border-app-border p-5 text-sm text-app-muted">
            Nothing scheduled today.
            {upcoming && (
              <>
                {" "}Next: <span className="font-semibold text-app-text">{upcoming.name}</span> on {shortDate(upcoming.day)}.
              </>
            )}
          </div>
        )}
      </section>

      {canBook && <BookCallCard coachName={coachName} />}

      <BreathwodCard />

      {missed.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-app-muted">Missed this week</h2>
          {missed.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-3 rounded-2xl border border-app-border bg-app-surface px-4 py-3">
              <Link href={`/client/workouts/${w.id}`} className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-app-warn">{shortDate(w.day)}</p>
                <p className="truncate font-display text-xl font-semibold leading-tight">{w.name}</p>
              </Link>
              {canMove && (
                <MoveWorkoutButton
                  workoutId={w.id}
                  currentDay={w.day}
                  className="h-11 shrink-0 rounded-xl border border-app-border px-4 text-sm font-semibold text-app-text"
                  label="Do today"
                  quickTo={today}
                />
              )}
            </div>
          ))}
        </section>
      )}

      {!todays.length && upcoming && (
        <section className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-app-muted">Up next · {shortDate(upcoming.day)}</h2>
          <SessionCard w={upcoming} canMove={canMove} />
        </section>
      )}

      {latestNote && (
        <Link
          href={`/client/workouts/${latestNote.workoutId}`}
          className="flex items-center gap-3 rounded-2xl border border-app-border bg-app-surface px-4 py-3"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-app-surface2 font-display text-sm font-bold">
            {latestNote.author.split(" ").map((p) => p[0]).slice(0, 2).join("")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{latestNote.author} left a note</span>
            <span className="block truncate text-sm text-app-muted">{latestNote.body}</span>
          </span>
          <span className="h-2 w-2 shrink-0 rounded-full bg-app-accent" />
        </Link>
      )}
    </div>
  )
}
