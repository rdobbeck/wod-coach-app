'use client'

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import CommentThread from "@/components/CommentThread"
import ExerciseHistorySheet from "@/components/ExerciseHistorySheet"
import VideoPlayer, { type PlayerItem } from "@/components/VideoPlayer"
import VideoThumb from "@/components/VideoThumb"
import { summarizeEntry, type HistoryEntry, type SetMeasure } from "@/lib/training-format"
import { formatClock, restSecondsFor } from "@/lib/rest"
import { parseTracking, type Hold, type Tracking } from "@/lib/hold"
import Hint from "./Hint"
import MoveWorkoutButton from "./MoveWorkoutButton"

type SetRow = { reps: number | null; weight: number | null; rpe: number | null; done?: boolean }
export type PlayerExercise = {
  id: string
  exerciseId: string | null
  name: string
  prescription: string | null
  /** The coach's reps field as written ("8-12", "60s", "30m", "max"); a hold or distance is read from here or the prescription. */
  reps: string | null
  /** The exercise library's tag ("distance" for carries and sleds), used when the target names no unit. */
  libraryTracking: string | null
  /** The coach's rest field on this exercise, used when the prescription text doesn't say. */
  restSeconds: number | null
  notes: string | null
  plannedSets: number | null
  videoUrl: string | null
  isCircuit: boolean
  lastTime: HistoryEntry | null
  resultText: string
  rpe: number | null
  sets: SetRow[]
}
type PlayerWorkout = {
  id: string
  name: string
  day: string
  programName: string | null
  coachNotes: string | null
  warmup: string | null
  cooldown: string | null
  description: string | null
  isCompleted: boolean
  notes: string
  comments: { id: string; author: string; body: string; at: string; mine?: boolean; attachments?: { id: string; mime: string; url: string | null }[] }[]
}

const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "short", day: "numeric" }) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" })

const numOrNull = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v))
const isLogged = (e: PlayerExercise) => !!e.resultText.trim() || e.rpe !== null || e.sets.some((s) => s.done)

/** How the second column of a set row reads and logs, from what the set measures. */
const measureOf = (t: Tracking): SetMeasure => (t.kind === "timed" ? "seconds" : t.kind === "distance" ? { distance: t.unit } : "reps")

function TextBlock({ title, text, open = false }: { title: string; text: string | null; open?: boolean }) {
  if (!text) return null
  return (
    <details className="rounded-2xl border border-app-border bg-app-surface p-4" open={open}>
      <summary className="cursor-pointer font-display text-sm font-semibold uppercase tracking-[0.14em] text-app-muted">{title}</summary>
      <p className="mt-2 whitespace-pre-line text-sm">{text}</p>
    </details>
  )
}

/** Number field with -/+ steppers, sized for thumbs. */
function Stepper({ value, step, onChange, ariaLabel }: { value: number | null; step: number; onChange: (v: number | null) => void; ariaLabel: string }) {
  const bump = (d: number) => {
    const next = Math.round(((value ?? 0) + d) * 100) / 100
    onChange(next > 0 ? next : null)
  }
  return (
    <div className="flex h-12 items-center justify-between rounded-xl border border-app-border bg-app-bg px-1">
      <button type="button" onClick={() => bump(-step)} aria-label={`${ariaLabel} down`} className="h-full w-9 text-lg text-app-muted">−</button>
      <input
        inputMode="decimal"
        aria-label={ariaLabel}
        value={value ?? ""}
        onChange={(e) => onChange(numOrNull(e.target.value))}
        className="w-full min-w-0 bg-transparent text-center text-base font-bold text-app-text outline-none"
      />
      <button type="button" onClick={() => bump(step)} aria-label={`${ariaLabel} up`} className="h-full w-9 text-lg text-app-muted">+</button>
    </div>
  )
}

export default function WorkoutPlayer({
  workout,
  exercises: initial,
  units,
  canMove,
  defaultRestSeconds = 90,
  coaching,
}: {
  workout: PlayerWorkout
  exercises: PlayerExercise[]
  units: string
  canMove: boolean
  /** Used when the prescription doesn't mention rest; set by the coach. */
  defaultRestSeconds?: number
  /** Set when the coach runs this session for the client in person: same screen, coach's navigation. */
  coaching?: { clientId: string; clientName: string; exitHref: string }
}) {
  const exitHref = coaching?.exitHref ?? "/client"
  const router = useRouter()
  const [exercises, setExercises] = useState(initial)
  const [notes, setNotes] = useState(workout.notes)
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [finishing, setFinishing] = useState(false)
  const [historyFor, setHistoryFor] = useState<PlayerExercise | null>(null)
  const [videoIndex, setVideoIndex] = useState<number | null>(null)
  // One exercise open at a time: the first not yet logged.
  const [openId, setOpenId] = useState<string | null>(initial.find((e) => !isLogged(e))?.id ?? initial[0]?.id ?? null)
  // Both timers run off wall-clock timestamps, not a once-a-second tick, so a
  // locked phone doesn't stall them: `left`/`elapsed` are recomputed from Date.now().
  const [rest, setRest] = useState<{ endsAt: number; total: number; left: number } | null>(null)
  const [hold, setHold] = useState<{
    exerciseId: string
    setIndex: number
    mode: Hold["mode"]
    target: number | null
    startedAt: number
    elapsed: number
  } | null>(null)

  const videos: PlayerItem[] = exercises
    .filter((e) => e.videoUrl)
    .map((e) => ({ key: e.id, title: e.name, subtitle: e.prescription, url: e.videoUrl! }))
  const playVideo = (exerciseId: string) => setVideoIndex(Math.max(videos.findIndex((v) => v.key === exerciseId), 0))
  const doneCount = exercises.filter(isLogged).length

  // ---- rest timer -------------------------------------------------------
  const restEndsAt = rest?.endsAt
  useEffect(() => {
    if (!restEndsAt) return
    let doneTimer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      const left = Math.ceil((restEndsAt - Date.now()) / 1000)
      setRest((r) => (r && r.endsAt === restEndsAt ? { ...r, left } : r))
      if (left <= 0) {
        clearInterval(id)
        navigator.vibrate?.([120, 60, 120])
        doneTimer = setTimeout(() => setRest((r) => (r && r.endsAt === restEndsAt ? null : r)), 2500)
      }
    }
    const id = setInterval(tick, 250)
    tick()
    return () => {
      clearInterval(id)
      clearTimeout(doneTimer)
    }
  }, [restEndsAt])

  const startRest = (e: PlayerExercise) => {
    const seconds = restSecondsFor(e, defaultRestSeconds)
    setRest({ endsAt: Date.now() + seconds * 1000, total: seconds, left: seconds })
    navigator.vibrate?.(20)
  }

  // ---- hold timer (planks, hangs) -----------------------------------------
  const holdStartedAt = hold?.startedAt
  useEffect(() => {
    if (!holdStartedAt || !hold) return
    const { mode, target } = hold
    const tick = () => {
      const elapsed = Math.floor((Date.now() - holdStartedAt) / 1000)
      setHold((h) => (h && h.startedAt === holdStartedAt ? { ...h, elapsed } : h))
      if (mode === "down" && target !== null && elapsed >= target) {
        clearInterval(id)
        finishHoldRef.current(target)
      }
    }
    const id = setInterval(tick, 250)
    tick()
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdStartedAt])

  const startHold = (e: PlayerExercise, i: number, h: Hold) => {
    setRest(null)
    setHold({ exerciseId: e.id, setIndex: i, mode: h.mode, target: h.seconds, startedAt: Date.now(), elapsed: 0 })
    navigator.vibrate?.(20)
  }

  /** The hold ends: the seconds go in the set, the set ticks, and rest starts as usual. */
  const finishHold = (seconds: number) => {
    if (!hold) return
    const e = latest.current.exercises.find((x) => x.id === hold.exerciseId)
    setHold(null)
    if (!e) return
    navigator.vibrate?.([120, 60, 120])
    const rows = rowsFor(e)
    const logged = Math.max(seconds, 1)
    const sets = rows.map((s, j) => {
      if (j === hold.setIndex) return { ...s, reps: logged, done: true }
      // Carry the time down to the next set, same as reps.
      if (j === hold.setIndex + 1 && !s.done) return { ...s, weight: s.weight ?? rows[hold.setIndex].weight ?? null, reps: s.reps ?? logged }
      return s
    })
    update(e.id, { sets })
    startRest(e)
  }
  const finishHoldRef = useRef(finishHold)
  finishHoldRef.current = finishHold

  // ---- autosave ---------------------------------------------------------
  const dirty = useRef(new Set<string>())
  const notesDirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const latest = useRef({ exercises, notes })
  latest.current = { exercises, notes }

  const flush = useCallback(async (complete = false) => {
    clearTimeout(timer.current)
    const ids = Array.from(dirty.current)
    if (!ids.length && !notesDirty.current && !complete) return true
    dirty.current.clear()
    const sendNotes = notesDirty.current
    notesDirty.current = false
    setStatus("saving")
    const res = await fetch(`/api/workouts/${workout.id}/log`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exercises: latest.current.exercises
          .filter((e) => ids.includes(e.id))
          .map((e) => ({ workoutExerciseId: e.id, resultText: e.resultText, rpe: e.rpe, sets: e.sets })),
        ...(sendNotes ? { notes: latest.current.notes } : {}),
        complete,
      }),
    }).catch(() => null)
    if (!res?.ok) {
      ids.forEach((id) => dirty.current.add(id)) // retry on next change or finish
      if (sendNotes) notesDirty.current = true
      setStatus("error")
      return false
    }
    setStatus("saved")
    return true
  }, [workout.id])

  const schedule = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 1000)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  // Save when the app is backgrounded (phone locked, tab switched).
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && void flush()
    document.addEventListener("visibilitychange", onHide)
    return () => document.removeEventListener("visibilitychange", onHide)
  }, [flush])

  const update = (id: string, patch: Partial<PlayerExercise>) => {
    setExercises((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    dirty.current.add(id)
    schedule()
  }
  const updateSet = (e: PlayerExercise, i: number, patch: Partial<SetRow>) =>
    update(e.id, { sets: rowsFor(e).map((s, j) => (j === i ? { ...s, ...patch } : s)) })

  /** Rows to start from: last time's numbers when we have them, else blanks. */
  const seedSets = (e: PlayerExercise): SetRow[] => {
    const planned = Math.min(Math.max(e.plannedSets ?? e.lastTime?.sets.length ?? 3, 1), 12)
    const last = e.lastTime?.sets ?? []
    // A timed or distance exercise starts at its prescribed seconds or distance when there's no history.
    const t = parseTracking(e)
    const target =
      t.kind === "timed" ? t.hold.seconds : t.kind === "distance" && t.amount !== null && Number.isInteger(t.amount) ? t.amount : null
    return Array.from({ length: planned }, (_, i) => ({
      weight: last[i]?.weight ?? last[last.length - 1]?.weight ?? null,
      reps: last[i]?.reps ?? last[last.length - 1]?.reps ?? target,
      rpe: null,
      done: false,
    }))
  }

  /**
   * The set rows to show. Once the client has touched an exercise these are
   * its saved sets; before that they are a suggestion (last time's numbers, or
   * the planned set count) shown ready to tick, and nothing is saved until
   * they change or tick one. Exercises with neither, like a timed carry or a
   * run, get no rows and a button instead, so cardio isn't a wall of blanks.
   */
  const rowsFor = (e: PlayerExercise): SetRow[] =>
    e.sets.length ? e.sets : e.lastTime?.sets.length || e.plannedSets ? seedSets(e) : []

  /**
   * Take one past day's numbers as today's starting point. The set rows are
   * replaced with exactly what was done that day, unticked so the client still
   * confirms each one as they go.
   */
  const useHistory = (e: PlayerExercise, h: HistoryEntry) => {
    const src = [...h.sets].sort((a, b) => a.setNumber - b.setNumber).slice(0, 12)
    if (!src.length) return
    update(e.id, { sets: src.map((s) => ({ weight: s.weight, reps: s.reps, rpe: null, done: false })) })
    setHistoryFor(null)
    toast.success(`Filled from ${fmtDay(h.date, { month: "short", day: "numeric" })}`)
  }

  const tickSet = (e: PlayerExercise, i: number) => {
    const rows = rowsFor(e)
    const set = rows[i]
    const next = !set.done
    const reps = set.reps ?? (next ? e.lastTime?.sets[i]?.reps ?? null : null)

    // Ticking a set carries its numbers down to the next row, on the
    // assumption the next set is the same until the client says otherwise.
    // Only blanks are filled, so anything they typed is never overwritten,
    // and the steppers make going up from there one tap.
    const sets = rows.map((s, j) => {
      if (j === i) return { ...s, done: next, reps }
      if (j === i + 1 && next && !s.done) {
        return { ...s, weight: s.weight ?? set.weight ?? null, reps: s.reps ?? reps }
      }
      return s
    })
    update(e.id, { sets })

    if (next) startRest(e)
  }

  const finish = async () => {
    setFinishing(true)
    const ok = await flush(true)
    setFinishing(false)
    if (!ok) return toast.error("Couldn't save. Check your connection and try again.")
    toast.success("Workout complete. Nice work!")
    router.push(exitHref)
    router.refresh()
  }

  return (
    <div className="space-y-4 pb-60">
      <div className="flex items-center justify-between">
        <Link href={exitHref} className="text-sm font-semibold text-app-muted">{coaching ? "‹ Exit" : "‹ Today"}</Link>
        <span className="text-xs text-app-muted">
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Not saved, will retry" : ""}
        </span>
      </div>

      <header className="space-y-2">
        {workout.programName && (
          <p className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-app-accent">{workout.programName}</p>
        )}
        <h1 className="font-display text-3xl font-bold leading-none">{workout.name}</h1>
        <div className="flex items-center gap-3 text-sm text-app-muted">
          <span>{fmtDay(workout.day)}</span>
          {workout.isCompleted && <span className="font-semibold text-app-good">Completed</span>}
          {canMove && !workout.isCompleted && (
            <MoveWorkoutButton workoutId={workout.id} currentDay={workout.day} className="text-sm font-semibold text-app-accent" />
          )}
        </div>
        {exercises.length > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <div className="flex flex-1 gap-1">
              {exercises.map((e) => (
                <span key={e.id} className={`h-1 flex-1 rounded-full ${isLogged(e) ? "bg-app-good" : "bg-app-surface2"}`} />
              ))}
            </div>
            <span className="text-xs font-semibold text-app-muted">{doneCount}/{exercises.length}</span>
          </div>
        )}
      </header>

      {videos.length > 0 && (
        <button
          onClick={() => setVideoIndex(0)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-app-surface2 py-3 font-display text-sm font-semibold uppercase tracking-[0.14em]"
        >
          ▶ Watch all demos <span className="text-app-muted">({videos.length})</span>
        </button>
      )}

      <TextBlock title="Coach notes" text={workout.coachNotes} open />
      <TextBlock title="Notes" text={workout.description} />
      <TextBlock title="Warm-up" text={workout.warmup} />

      <ol className="space-y-3">
        {exercises.map((e, idx) => {
          const open = openId === e.id
          const logged = isLogged(e)
          const tracking = parseTracking(e)
          const timed = tracking.kind === "timed" ? tracking.hold : null
          const distance = tracking.kind === "distance" ? tracking : null
          const repsLabel = timed ? "Sec" : distance ? distance.unit ?? "Dist" : "Reps"
          return (
            <li key={e.id} className="overflow-hidden rounded-2xl border border-app-border bg-app-surface">
              <div className="flex items-center gap-3 p-4">
                <button onClick={() => setOpenId(open ? null : e.id)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      logged ? "bg-app-good text-white" : "border border-app-border text-app-muted"
                    }`}
                  >
                    {logged ? "✓" : idx + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-display text-xl font-semibold leading-tight">{e.name}</span>
                    {!open && <span className="block truncate text-xs text-app-muted">{e.prescription ?? "Tap to log"}</span>}
                  </span>
                </button>
                {e.videoUrl && <VideoThumb compact url={e.videoUrl} title={e.name} onPlay={() => playVideo(e.id)} className="w-20 shrink-0" />}
              </div>

              {open && (
                <div className="space-y-3 border-t border-app-border px-4 pb-4 pt-3">
                  {e.isCircuit && <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-app-accent">Circuit</p>}
                  {e.prescription && <p className="whitespace-pre-line text-sm">{e.prescription}</p>}
                  {/* What the timers will do, so a wrong rest or hold is visible before the first set. */}
                  <p className="text-xs font-semibold text-app-muted">
                    {timed && (timed.mode === "down" ? `Hold ${formatClock(timed.seconds)} · ` : "Hold as long as you can · ")}
                    Rest {formatClock(restSecondsFor(e, defaultRestSeconds))}
                  </p>
                  {e.notes && <p className="whitespace-pre-line text-xs text-app-muted">{e.notes}</p>}

                  <button onClick={() => setHistoryFor(e)} className="block w-full rounded-xl bg-app-bg px-3 py-2 text-left text-xs text-app-muted">
                    {e.lastTime ? (
                      <>
                        <span className="font-semibold text-app-text">Last time ({fmtDay(e.lastTime.date, { month: "short", day: "numeric" })}):</span>{" "}
                        {summarizeEntry(e.lastTime, units, measureOf(tracking)) || "done"} <span className="text-app-accent">· History ›</span>
                      </>
                    ) : (
                      <>First time logging this <span className="text-app-accent">· History ›</span></>
                    )}
                  </button>

                  {!coaching && (
                    <Hint id={timed ? "log-holds" : "log-sets"} done={e.sets.some((s) => s.done)}>
                      {timed
                        ? "Press ▶ when you start the hold. It times you, ticks the set when you stop, and your rest starts."
                        : "Tick each set as you finish it. The next set copies your numbers, and your rest timer starts."}
                    </Hint>
                  )}

                  {rowsFor(e).length > 0 ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[1.5rem_1fr_1fr_3rem] gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-app-muted">
                        <span>Set</span>
                        <span>{units}</span>
                        <span>{repsLabel}</span>
                        <span className="text-center">{timed ? "Start" : "Done"}</span>
                      </div>
                      {rowsFor(e).map((s, i, rows) => {
                        const running = hold?.exerciseId === e.id && hold.setIndex === i
                        const isNext = i === rows.findIndex((x) => !x.done)
                        return (
                          <div key={i} className="grid grid-cols-[1.5rem_1fr_1fr_3rem] items-center gap-2">
                            <span className="font-display text-lg font-semibold text-app-muted">{i + 1}</span>
                            <Stepper value={s.weight} step={units === "kg" ? 2.5 : 5} onChange={(v) => updateSet(e, i, { weight: v })} ariaLabel={`Set ${i + 1} weight`} />
                            <Stepper
                              value={s.reps}
                              step={timed || (distance && (!distance.unit || ["m", "ft", "yd"].includes(distance.unit))) ? 5 : 1}
                              onChange={(v) => updateSet(e, i, { reps: v })}
                              ariaLabel={`Set ${i + 1} ${timed ? "seconds" : distance ? "distance" : "reps"}`}
                            />
                            {timed && !s.done ? (
                              <button
                                onClick={() => (running ? finishHold(hold!.elapsed) : startHold(e, i, timed))}
                                aria-label={running ? `Stop set ${i + 1}` : `Start set ${i + 1}`}
                                className={`flex h-12 items-center justify-center rounded-xl border text-base ${
                                  running ? "border-app-accent bg-app-accent text-app-accent-text" : "border-app-border text-app-text"
                                } ${isNext && !hold ? "pulse-cta" : ""}`}
                              >
                                {running ? "■" : "▶"}
                              </button>
                            ) : (
                              <button
                                onClick={() => tickSet(e, i)}
                                aria-label={`Set ${i + 1} done`}
                                aria-pressed={!!s.done}
                                className={`flex h-12 items-center justify-center rounded-xl border text-base ${
                                  s.done ? "border-app-good bg-app-good text-white" : "border-app-border text-app-muted"
                                } ${isNext ? "pulse-cta" : ""}`}
                              >
                                ✓
                              </button>
                            )}
                          </div>
                        )
                      })}
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            update(e.id, { sets: [...rowsFor(e), { ...(rowsFor(e).at(-1) ?? { reps: null, weight: null, rpe: null }), done: false }] })
                          }
                          className="flex-1 rounded-xl border border-dashed border-app-border py-2 text-sm font-semibold text-app-muted"
                        >
                          + Add set
                        </button>
                        {e.sets.length > 0 && (
                          <button onClick={() => update(e.id, { sets: [] })} className="rounded-xl border border-app-border px-3 py-2 text-sm font-semibold text-app-muted">
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => update(e.id, { sets: seedSets(e) })}
                      className={`w-full rounded-xl border border-app-border py-3 text-sm font-semibold text-app-text ${
                        isLogged(e) ? "" : "pulse-cta"
                      }`}
                    >
                      {timed ? "Log holds (seconds)" : distance ? `Log sets (weight × ${distance.unit ?? "distance"})` : "Log sets (weight × reps)"}
                    </button>
                  )}

                  <textarea
                    rows={1}
                    value={e.resultText}
                    onChange={(ev) => update(e.id, { resultText: ev.target.value })}
                    placeholder={`Result or note, e.g. 3×8 @ 135 ${units}`}
                    className="block w-full resize-none rounded-xl border border-app-border bg-app-bg px-3 py-2 text-base text-app-text placeholder:text-app-muted/70"
                  />

                  <div>
                    <p className="text-xs font-semibold text-app-muted">RPE (optional)</p>
                    <div className="mt-1 grid grid-cols-10 gap-1">
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          onClick={() => update(e.id, { rpe: e.rpe === n ? null : n })}
                          className={`rounded-lg py-1.5 text-sm font-semibold ${e.rpe === n ? "bg-app-accent text-app-accent-text" : "bg-app-surface2 text-app-text/80"}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {idx < exercises.length - 1 && (
                    <button
                      onClick={() => setOpenId(exercises[idx + 1].id)}
                      className="w-full truncate rounded-xl bg-app-accent px-3 py-3 font-display text-sm font-semibold uppercase tracking-[0.14em] text-app-accent-text"
                    >
                      Next: {exercises[idx + 1].name}
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>

      <TextBlock title="Cool-down" text={workout.cooldown} />

      <CommentThread
        workoutId={workout.id}
        initial={workout.comments}
        placeholder={coaching ? `Leave a note for ${coaching.clientName}` : "Ask your coach, or attach a video of a set"}
      />

      {exercises.length > 0 && (
        <textarea
          rows={2}
          value={notes}
          onChange={(ev) => {
            setNotes(ev.target.value)
            notesDirty.current = true
            schedule()
          }}
          placeholder={coaching ? "Session notes" : "How did it go? (optional note for your coach)"}
          className="block w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-base text-app-text placeholder:text-app-muted/70"
        />
      )}

      {/* Sticky stack above the tab bar (or the screen edge in coach mode): the rest countdown while it runs, finish always. */}
      {exercises.length > 0 && (
        <div className={`fixed inset-x-0 z-20 px-4 ${coaching ? "bottom-[calc(1rem+env(safe-area-inset-bottom))]" : "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"}`}>
          {hold && (() => {
            const ex = exercises.find((x) => x.id === hold.exerciseId)
            const shown = hold.mode === "down" && hold.target !== null ? Math.max(hold.target - hold.elapsed, 0) : hold.elapsed
            const pct = hold.mode === "down" && hold.target ? (shown / hold.target) * 100 : 100
            return (
              <div
                role="timer"
                aria-live="polite"
                className="mx-auto mb-2 max-w-md overflow-hidden rounded-2xl border border-app-accent bg-app-surface shadow-lg"
              >
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-app-muted">
                      {ex?.name ?? "Hold"} · set {hold.setIndex + 1}{hold.mode === "up" ? " · max hold" : ""}
                    </p>
                    <p className="font-display text-5xl font-bold leading-none tabular-nums">{formatClock(shown)}</p>
                  </div>
                  <button
                    onClick={() => finishHold(hold.elapsed)}
                    aria-label="Stop hold"
                    className="h-12 rounded-xl bg-app-accent px-5 text-sm font-semibold text-app-accent-text"
                  >
                    Stop
                  </button>
                </div>
                <div className="h-1.5 bg-app-surface2">
                  <div className="h-full bg-app-accent transition-[width] duration-300 ease-linear" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
                </div>
              </div>
            )
          })()}
          {rest && !hold && !coaching && (
            <div className="mx-auto mb-2 max-w-md shadow-lg">
              <Hint id="rest-timer" done={rest.left <= 0}>
                Rest counts down on its own. Add 30 seconds or skip it here, and your phone buzzes when you&rsquo;re up.
              </Hint>
            </div>
          )}
          {rest && !hold && (
            <div
              role="timer"
              aria-live="polite"
              className="mx-auto mb-2 max-w-md overflow-hidden rounded-2xl border border-app-border bg-app-surface shadow-lg"
            >
              <div className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-app-muted">{rest.left > 0 ? "Rest" : "Rest done"}</p>
                  <p className={`font-display text-5xl font-bold leading-none tabular-nums ${rest.left <= 0 ? "text-app-good" : ""}`}>
                    {rest.left > 0 ? formatClock(rest.left) : "Go"}
                  </p>
                </div>
                <button
                  onClick={() => setRest((r) => (r ? { endsAt: r.endsAt + 30_000, left: r.left + 30, total: Math.max(r.total, r.left + 30) } : r))}
                  aria-label="Add 30 seconds"
                  className="h-12 rounded-xl border border-app-border px-4 text-sm font-semibold text-app-text"
                >
                  +30s
                </button>
                <button onClick={() => setRest(null)} aria-label="Skip rest" className="h-12 rounded-xl border border-app-border px-4 text-sm font-semibold text-app-text">
                  Skip
                </button>
              </div>
              <div className="h-1.5 bg-app-surface2">
                <div
                  className={`h-full transition-[width] duration-1000 ease-linear ${rest.left <= 0 ? "bg-app-good" : "bg-app-accent"}`}
                  style={{ width: `${Math.max(0, Math.min(100, (rest.left / rest.total) * 100))}%` }}
                />
              </div>
            </div>
          )}
          <div className="mx-auto flex max-w-md items-center gap-2">
            <button
              onClick={finish}
              disabled={finishing}
              className={`h-14 flex-1 rounded-xl bg-app-accent font-display text-xl font-bold uppercase tracking-[0.06em] text-app-accent-text shadow-lg disabled:opacity-60 ${
                doneCount === exercises.length && !workout.isCompleted ? "pulse-cta" : ""
              }`}
            >
              {finishing ? "Saving…" : workout.isCompleted ? "Save changes" : "Finish workout"}
            </button>
          </div>
        </div>
      )}

      {videoIndex !== null && <VideoPlayer items={videos} startIndex={videoIndex} onClose={() => setVideoIndex(null)} />}
      {historyFor && (
        <ExerciseHistorySheet
          clientId={coaching?.clientId}
          exerciseId={historyFor.exerciseId}
          name={historyFor.name}
          units={units}
          measure={measureOf(parseTracking(historyFor))}
          onClose={() => setHistoryFor(null)}
          onUse={(h) => useHistory(historyFor, h)}
        />
      )}
    </div>
  )
}
