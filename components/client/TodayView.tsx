'use client'

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { DragGhost, useDragToDay } from "@/components/useDragToDay"
import MoveWorkoutButton, { localDayKey } from "./MoveWorkoutButton"
import FastingCard from "./FastingCard"
import PlanWeekButton from "./PlanWeekButton"
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

function SessionCard({
  w,
  canMove,
  primary,
  dragProps,
  dragging,
}: {
  w: DayWorkout
  canMove: boolean
  primary?: boolean
  /** Present when this card can be long-pressed and dropped on a day. */
  dragProps?: Record<string, unknown>
  dragging?: boolean
}) {
  if (w.isRest) {
    return (
      <div className="rounded-2xl border border-app-border bg-app-surface p-5">
        <p className="font-display text-2xl font-bold">Rest day</p>
        <p className="mt-1 text-sm text-app-muted">Recover well. See you next session.</p>
      </div>
    )
  }
  return (
    <div
      {...dragProps}
      className={`overflow-hidden rounded-2xl border bg-app-surface transition-opacity ${primary ? "border-app-accent/60" : "border-app-border"} ${
        dragging ? "opacity-40" : ""
      }`}
    >
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
function BookCallCard({ coachName, callsLeft, nudge }: { coachName: string | null; callsLeft: number | null; nudge?: boolean }) {
  return (
    <Link
      href="/client/book"
      className={`flex items-center gap-3 rounded-2xl border bg-app-surface px-4 py-3.5 ${nudge ? "pulse-cta border-app-accent/60" : "border-app-border"}`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-surface2">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-xl font-bold leading-tight">Book a call</span>
        <span className="block text-sm text-app-muted">
          {callsLeft === null
            ? `Pick a time with ${coachName ?? "your coach"}`
            : callsLeft > 0
              ? `${callsLeft} free ${callsLeft === 1 ? "call" : "calls"} left this month`
              : "Free calls used this month"}
          {nudge && " · they reset on the 1st"}
        </span>
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

/** How far either side of this week the client can page. Matches what Today loads. */
const WEEKS_BACK = 2
const WEEKS_AHEAD = 11

const weekLabel = (offset: number, first: string, last: string) =>
  offset === 0
    ? "This week"
    : offset === 1
      ? "Next week"
      : offset === -1
        ? "Last week"
        : `${new Date(`${first}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })} to ${new Date(
            `${last}T12:00:00`
          ).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`

export default function TodayView({
  firstName,
  coachName,
  canMove,
  compliance,
  workouts,
  latestNote,
  fasting,
  canBook,
  callsLeft,
}: {
  firstName: string
  coachName: string | null
  canMove: boolean
  compliance: number | null
  workouts: DayWorkout[]
  latestNote: Note | null
  fasting: Fasting | null
  canBook: boolean
  /** Free calls left this month, or null when the coach has no limit. */
  callsLeft: number | null
}) {
  const router = useRouter()
  // "Today" is the client's local day, so it's computed in the browser.
  const [today, setToday] = useState<string | null>(null)
  const [items, setItems] = useState(workouts)
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => setItems(workouts), [workouts])
  useEffect(() => {
    const t = localDayKey()
    setToday(t)
    setSelected(t)
  }, [])

  const move = async (id: string, to: string) => {
    const w = items.find((x) => x.id === id)
    if (!w || !today) return
    const before = items
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, day: to, movedFrom: x.movedFrom ?? x.day } : x)))
    const res = await fetch(`/api/workouts/${id}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: to, today }),
    }).catch(() => null)
    if (!res?.ok) {
      setItems(before)
      toast.error((await res?.json().catch(() => ({})))?.error ?? "Couldn't move that session")
      return
    }
    toast.success(`${w.name} moved to ${shortDate(to)}`)
    setSelected(to)
    router.refresh()
  }
  // Clients can only move into today or later; the server enforces the same.
  const { drag, draggable } = useDragToDay({ onDrop: move, canDrop: (day) => !!today && day >= today })

  // Swipe the week strip left or right to page through weeks.
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const page = (d: number) => setOffset((o) => Math.min(WEEKS_AHEAD, Math.max(-WEEKS_BACK, o + d)))

  if (!today || !selected) return null

  const todays = items.filter((w) => w.day === today)
  const upcoming = items.find((w) => w.day > today && !w.isRest)
  const weekAgo = localDayKey(new Date(Date.now() - 7 * 86_400_000))
  const missed = items.filter((w) => w.day < today && w.day >= weekAgo && !w.isCompleted && !w.isRest)

  const monday = new Date(`${today}T12:00:00`)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7)
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const key = localDayKey(d)
    const ws = items.filter((w) => w.day === key && !w.isRest)
    const status = !ws.length ? "none" : ws.every((w) => w.isCompleted) ? "done" : key < today ? "missed" : "planned"
    return { key, letter: d.toLocaleDateString("en-US", { weekday: "narrow" }), date: d.getDate(), status }
  })
  const bar = { done: "bg-app-good", missed: "bg-app-warn", planned: "bg-app-muted/50", none: "bg-transparent" }

  const onToday = selected === today
  const picked = items.filter((w) => w.day === selected)
  const canDrag = (w: DayWorkout) => canMove && !w.isCompleted && !w.isRest
  const card = (w: DayWorkout, primary?: boolean) => (
    <SessionCard
      key={w.id}
      w={w}
      canMove={canMove}
      primary={primary}
      dragProps={canDrag(w) ? draggable(w.id, w.day, w.name) : undefined}
      dragging={drag?.id === w.id}
    />
  )

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

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => page(-1)}
            disabled={offset <= -WEEKS_BACK}
            aria-label="Previous week"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-app-surface text-lg text-app-muted disabled:opacity-30"
          >
            ‹
          </button>
          <p className="flex-1 text-center font-display text-sm font-semibold uppercase tracking-[0.14em] text-app-muted">
            {weekLabel(offset, week[0].key, week[6].key)}
          </p>
          <button
            onClick={() => page(1)}
            disabled={offset >= WEEKS_AHEAD}
            aria-label="Next week"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-app-surface text-lg text-app-muted disabled:opacity-30"
          >
            ›
          </button>
        </div>

        <div
          className="flex gap-1.5"
          onTouchStart={(e) => (swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
          onTouchEnd={(e) => {
            const s = swipe.current
            swipe.current = null
            if (!s || drag) return
            const dx = e.changedTouches[0].clientX - s.x
            const dy = e.changedTouches[0].clientY - s.y
            if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) page(dx < 0 ? 1 : -1)
          }}
        >
          {week.map((d) => {
            const isToday = d.key === today
            const isPicked = d.key === selected
            const target = drag?.over === d.key && drag.ok
            return (
              <button
                key={d.key}
                data-drop-day={d.key}
                onClick={() => setSelected(d.key)}
                aria-pressed={isPicked}
                aria-label={`${new Date(`${d.key}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`}
                className={`flex flex-1 flex-col items-center gap-1.5 rounded-xl py-2 transition-shadow ${
                  target
                    ? "bg-app-surface ring-2 ring-app-accent shadow-[0_0_0_5px_rgba(var(--app-accent-rgb),0.25)]"
                    : isPicked
                      ? "bg-app-accent text-app-accent-text"
                      : isToday
                        ? "bg-app-surface ring-1 ring-app-accent"
                        : "bg-app-surface"
                }`}
              >
                <span className={`text-[11px] font-semibold ${isPicked && !target ? "text-app-accent-text/80" : "text-app-muted"}`}>{d.letter}</span>
                <span className="font-display text-lg font-semibold leading-none">{d.date}</span>
                <span className={`h-[3px] w-4 rounded-full ${isPicked && !target ? "bg-app-accent-text" : bar[d.status as keyof typeof bar]}`} />
              </button>
            )
          })}
        </div>

        {canMove && offset >= 0 && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-app-muted">Hold a session and drag it onto a day to move it.</p>
            <PlanWeekButton week={week.map((d) => d.key)} className="shrink-0 text-sm font-semibold text-app-accent" />
          </div>
        )}
      </div>

      {fasting && onToday && (
        <FastingCard
          protocol={fasting.protocol}
          targetHours={fasting.targetHours}
          windowStart={fasting.windowStart}
          windowEnd={fasting.windowEnd}
          openFast={fasting.openFast}
          recent={fasting.recent}
        />
      )}

      {onToday ? (
        <section className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-app-muted">Today</h2>
          {todays.length ? (
            todays.map((w) => card(w, true))
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
      ) : (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-app-muted">{shortDate(selected)}</h2>
            <button
              onClick={() => {
                setOffset(0)
                setSelected(today)
              }}
              className="text-sm font-semibold text-app-accent"
            >
              Back to today
            </button>
          </div>
          {picked.length ? (
            picked.map((w) => card(w))
          ) : (
            <div className="rounded-2xl border border-dashed border-app-border p-5 text-sm text-app-muted">
              Nothing scheduled {selected < today ? "that day" : "yet"}.
            </div>
          )}
        </section>
      )}

      {onToday && canBook && (
        <BookCallCard
          coachName={coachName}
          callsLeft={callsLeft}
          // Unused free calls in the last ten days of the month are about to
          // disappear, which is the one time this card should ask for a tap.
          nudge={!!callsLeft && callsLeft > 0 && Number(today.slice(8)) >= 21}
        />
      )}

      {onToday && <BreathwodCard />}

      {onToday && missed.length > 0 && (
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

      {onToday && !todays.length && upcoming && (
        <section className="space-y-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-app-muted">Up next · {shortDate(upcoming.day)}</h2>
          {card(upcoming)}
        </section>
      )}

      {onToday && latestNote && (
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

      <DragGhost drag={drag} className="bg-app-accent text-app-accent-text" />
    </div>
  )
}
