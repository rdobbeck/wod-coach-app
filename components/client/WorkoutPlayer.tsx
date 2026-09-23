'use client'

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import ExerciseHistorySheet from "@/components/ExerciseHistorySheet"
import VideoPlayer, { type PlayerItem } from "@/components/VideoPlayer"
import VideoThumb from "@/components/VideoThumb"
import { summarizeEntry, type HistoryEntry } from "@/lib/training-format"
import { formatClock, parseRestSeconds } from "@/lib/rest"
import MoveWorkoutButton from "./MoveWorkoutButton"

type SetRow = { reps: number | null; weight: number | null; rpe: number | null; done?: boolean }
export type PlayerExercise = {
  id: string
  exerciseId: string | null
  name: string
  prescription: string | null
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
  comments: { id: string; author: string; body: string; at: string }[]
}

const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "short", day: "numeric" }) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" })

const numOrNull = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v))
const isLogged = (e: PlayerExercise) => !!e.resultText.trim() || e.rpe !== null || e.sets.some((s) => s.done)

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
}: {
  workout: PlayerWorkout
  exercises: PlayerExercise[]
  units: string
  canMove: boolean
  /** Used when the prescription doesn't mention rest; set by the coach. */
  defaultRestSeconds?: number
}) {
  const router = useRouter()
  const [exercises, setExercises] = useState(initial)
  const [notes, setNotes] = useState(workout.notes)
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [finishing, setFinishing] = useState(false)
  const [historyFor, setHistoryFor] = useState<PlayerExercise | null>(null)
  const [videoIndex, setVideoIndex] = useState<number | null>(null)
  // One exercise open at a time: the first not yet logged.
  const [openId, setOpenId] = useState<string | null>(initial.find((e) => !isLogged(e))?.id ?? initial[0]?.id ?? null)
  const [rest, setRest] = useState<{ left: number; total: number } | null>(null)

  const videos: PlayerItem[] = exercises
    .filter((e) => e.videoUrl)
    .map((e) => ({ key: e.id, title: e.name, subtitle: e.prescription, url: e.videoUrl! }))
  const playVideo = (exerciseId: string) => setVideoIndex(Math.max(videos.findIndex((v) => v.key === exerciseId), 0))
  const doneCount = exercises.filter(isLogged).length

  // ---- rest timer -------------------------------------------------------
  useEffect(() => {
    if (!rest) return
    if (rest.left <= 0) {
      navigator.vibrate?.([120, 60, 120])
      const t = setTimeout(() => setRest(null), 2500)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setRest((r) => (r ? { ...r, left: r.left - 1 } : r)), 1000)
    return () => clearTimeout(t)
  }, [rest])

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
    update(e.id, { sets: e.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) })

  /** Rows to start from: last time's numbers when we have them, else blanks. */
  const seedSets = (e: PlayerExercise): SetRow[] => {
    const planned = Math.min(Math.max(e.plannedSets ?? e.lastTime?.sets.length ?? 3, 1), 12)
    const last = e.lastTime?.sets ?? []
    return Array.from({ length: planned }, (_, i) => ({
      weight: last[i]?.weight ?? last[last.length - 1]?.weight ?? null,
      reps: last[i]?.reps ?? last[last.length - 1]?.reps ?? null,
      rpe: null,
      done: false,
    }))
  }

  const tickSet = (e: PlayerExercise, i: number) => {
    const set = e.sets[i]
    const next = !set.done
    updateSet(e, i, { done: next, ...(next && set.reps === null ? { reps: e.lastTime?.sets[i]?.reps ?? null } : {}) })
    if (next) {
      const seconds = parseRestSeconds(e.prescription) ?? defaultRestSeconds
      setRest({ left: seconds, total: seconds })
      navigator.vibrate?.(20)
    }
  }

  const finish = async () => {
    setFinishing(true)
    const ok = await flush(true)
    setFinishing(false)
    if (!ok) return toast.error("Couldn't save. Check your connection and try again.")
    toast.success("Workout complete. Nice work!")
    router.push("/client")
    router.refresh()
  }

  return (
    <div className="space-y-4 pb-36">
      <div className="flex items-center justify-between">
        <Link href="/client" className="text-sm font-semibold text-app-muted">‹ Today</Link>
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
                  {e.notes && <p className="whitespace-pre-line text-xs text-app-muted">{e.notes}</p>}

                  <button onClick={() => setHistoryFor(e)} className="block w-full rounded-xl bg-app-bg px-3 py-2 text-left text-xs text-app-muted">
                    {e.lastTime ? (
                      <>
                        <span className="font-semibold text-app-text">Last time ({fmtDay(e.lastTime.date, { month: "short", day: "numeric" })}):</span>{" "}
                        {summarizeEntry(e.lastTime, units) || "done"} <span className="text-app-accent">· History ›</span>
                      </>
                    ) : (
                      <>First time logging this <span className="text-app-accent">· History ›</span></>
                    )}
                  </button>

                  {e.sets.length > 0 ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[1.5rem_1fr_1fr_3rem] gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-app-muted">
                        <span>Set</span>
                        <span>{units}</span>
                        <span>Reps</span>
                        <span className="text-center">Done</span>
                      </div>
                      {e.sets.map((s, i) => (
                        <div key={i} className="grid grid-cols-[1.5rem_1fr_1fr_3rem] items-center gap-2">
                          <span className="font-display text-lg font-semibold text-app-muted">{i + 1}</span>
                          <Stepper value={s.weight} step={units === "kg" ? 2.5 : 5} onChange={(v) => updateSet(e, i, { weight: v })} ariaLabel={`Set ${i + 1} weight`} />
                          <Stepper value={s.reps} step={1} onChange={(v) => updateSet(e, i, { reps: v })} ariaLabel={`Set ${i + 1} reps`} />
                          <button
                            onClick={() => tickSet(e, i)}
                            aria-label={`Set ${i + 1} done`}
                            aria-pressed={!!s.done}
                            className={`flex h-12 items-center justify-center rounded-xl border text-base ${
                              s.done ? "border-app-good bg-app-good text-white" : "border-app-border text-app-muted"
                            }`}
                          >
                            ✓
                          </button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            update(e.id, { sets: [...e.sets, { ...(e.sets[e.sets.length - 1] ?? { reps: null, weight: null, rpe: null }), done: false }] })
                          }
                          className="flex-1 rounded-xl border border-dashed border-app-border py-2 text-sm font-semibold text-app-muted"
                        >
                          + Add set
                        </button>
                        <button onClick={() => update(e.id, { sets: [] })} className="rounded-xl border border-app-border px-3 py-2 text-sm font-semibold text-app-muted">
                          Clear
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => update(e.id, { sets: seedSets(e) })} className="w-full rounded-xl border border-app-border py-3 text-sm font-semibold text-app-text">
                      {e.lastTime?.sets.length ? "Log sets, start from last time" : "Log sets (weight × reps)"}
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
                      className="w-full truncate rounded-xl bg-app-surface2 px-3 py-3 font-display text-sm font-semibold uppercase tracking-[0.14em]"
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

      {workout.comments.length > 0 && (
        <section className="rounded-2xl border border-app-border bg-app-surface p-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-app-muted">Comments</h2>
          <ul className="mt-2 space-y-2">
            {workout.comments.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="font-semibold">{c.author}:</span> <span className="text-app-text/80">{c.body}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {exercises.length > 0 && (
        <textarea
          rows={2}
          value={notes}
          onChange={(ev) => {
            setNotes(ev.target.value)
            notesDirty.current = true
            schedule()
          }}
          placeholder="How did it go? (optional note for your coach)"
          className="block w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-base text-app-text placeholder:text-app-muted/70"
        />
      )}

      {/* Sticky bar above the tab bar: rest timer while it runs, finish always. */}
      {exercises.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 px-4">
          <div className="mx-auto flex max-w-md items-center gap-2">
            {rest && (
              <div className="flex h-14 items-center gap-2 rounded-xl border border-app-border bg-app-surface px-3 shadow-lg">
                <div className="flex flex-col items-center">
                  <span className={`font-display text-xl font-bold leading-none ${rest.left <= 0 ? "text-app-good" : ""}`}>
                    {rest.left > 0 ? formatClock(rest.left) : "Go"}
                  </span>
                  <span className="text-[9px] uppercase tracking-[0.1em] text-app-muted">Rest</span>
                </div>
                <button onClick={() => setRest((r) => (r ? { ...r, left: r.left + 30 } : r))} aria-label="Add 30 seconds" className="px-1 text-xs font-semibold text-app-muted">
                  +30
                </button>
                <button onClick={() => setRest(null)} aria-label="Skip rest" className="px-1 text-xs font-semibold text-app-muted">
                  Skip
                </button>
              </div>
            )}
            <button
              onClick={finish}
              disabled={finishing}
              className="h-14 flex-1 rounded-xl bg-app-accent font-display text-xl font-bold uppercase tracking-[0.06em] text-app-accent-text shadow-lg disabled:opacity-60"
            >
              {finishing ? "Saving…" : workout.isCompleted ? "Save changes" : "Finish workout"}
            </button>
          </div>
        </div>
      )}

      {videoIndex !== null && <VideoPlayer items={videos} startIndex={videoIndex} onClose={() => setVideoIndex(null)} />}
      {historyFor && <ExerciseHistorySheet exerciseId={historyFor.exerciseId} name={historyFor.name} units={units} onClose={() => setHistoryFor(null)} />}
    </div>
  )
}
