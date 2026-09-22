'use client'

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import ExerciseHistorySheet from "@/components/ExerciseHistorySheet"
import { summarizeEntry, type HistoryEntry } from "@/lib/training-format"
import MoveWorkoutButton from "./MoveWorkoutButton"
import VideoPlayer, { type PlayerItem } from "@/components/VideoPlayer"
import VideoThumb from "@/components/VideoThumb"

type SetRow = { reps: number | null; weight: number | null; rpe: number | null }
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

function TextBlock({ title, text }: { title: string; text: string | null }) {
  if (!text) return null
  return (
    <details className="rounded-2xl border border-gray-200 bg-white p-4" open={title === "Coach notes"}>
      <summary className="cursor-pointer text-sm font-semibold text-gray-900">{title}</summary>
      <p className="mt-2 whitespace-pre-line text-sm text-gray-700">{text}</p>
    </details>
  )
}

const numOrNull = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v))

export default function WorkoutPlayer({
  workout,
  exercises: initial,
  units,
  canMove,
}: {
  workout: PlayerWorkout
  exercises: PlayerExercise[]
  units: string
  canMove: boolean
}) {
  const router = useRouter()
  const [exercises, setExercises] = useState(initial)
  const [notes, setNotes] = useState(workout.notes)
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [finishing, setFinishing] = useState(false)
  const [historyFor, setHistoryFor] = useState<PlayerExercise | null>(null)
  const [videoIndex, setVideoIndex] = useState<number | null>(null)
  // Every exercise with a demo, in workout order, so the player can flip through them.
  const videos: PlayerItem[] = exercises
    .filter((e) => e.videoUrl)
    .map((e) => ({ key: e.id, title: e.name, subtitle: e.prescription, url: e.videoUrl! }))
  const playVideo = (exerciseId: string) => setVideoIndex(Math.max(videos.findIndex((v) => v.key === exerciseId), 0))
  const [showSets, setShowSets] = useState<Record<string, boolean>>(
    Object.fromEntries(initial.map((e) => [e.id, e.sets.length > 0]))
  )

  // Autosave: collect changed exercises and flush ~1s after the last edit.
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
  const openSets = (e: PlayerExercise) => {
    setShowSets((s) => ({ ...s, [e.id]: true }))
    if (!e.sets.length) {
      const n = Math.min(Math.max(e.plannedSets ?? 1, 1), 10)
      setExercises((xs) => xs.map((x) => (x.id === e.id ? { ...x, sets: Array.from({ length: n }, () => ({ reps: null, weight: null, rpe: null })) } : x)))
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/client" className="text-sm font-semibold text-primary-600">← Today</Link>
        <span className="text-xs text-gray-500">
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Not saved, will retry" : ""}
        </span>
      </div>

      <header>
        {workout.programName && <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{workout.programName}</p>}
        <h1 className="text-2xl font-bold text-gray-900">{workout.name}</h1>
        <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
          <span>{fmtDay(workout.day)}</span>
          {workout.isCompleted && <span className="font-semibold text-green-600">Completed</span>}
          {canMove && !workout.isCompleted && <MoveWorkoutButton workoutId={workout.id} currentDay={workout.day} />}
        </div>
      </header>

      {videos.length > 0 && (
        <button onClick={() => setVideoIndex(0)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-900 py-3 text-sm font-semibold text-white">
          ▶ Watch all demos <span className="text-white/60">({videos.length})</span>
        </button>
      )}

      <TextBlock title="Coach notes" text={workout.coachNotes} />
      <TextBlock title="Notes" text={workout.description} />
      <TextBlock title="Warm-up" text={workout.warmup} />

      <ol className="space-y-3">
        {exercises.map((e, idx) => (
          <li key={e.id} className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <button onClick={() => setHistoryFor(e)} className="text-left">
                <span className="text-xs font-semibold text-gray-400">{e.isCircuit ? "Circuit" : `#${idx + 1}`}</span>
                <p className="text-base font-bold text-gray-900">{e.name}</p>
              </button>
              {e.videoUrl && <VideoThumb compact url={e.videoUrl} title={e.name} onPlay={() => playVideo(e.id)} className="w-28 shrink-0" />}
            </div>

            {e.prescription && <p className="mt-2 whitespace-pre-line text-sm text-gray-700">{e.prescription}</p>}
            {e.notes && <p className="mt-1 whitespace-pre-line text-xs text-gray-500">{e.notes}</p>}

            <button onClick={() => setHistoryFor(e)} className="mt-2 block w-full rounded-lg bg-gray-50 px-3 py-2 text-left text-xs text-gray-600">
              {e.lastTime ? (
                <>
                  <span className="font-semibold text-gray-700">Last time ({fmtDay(e.lastTime.date, { month: "short", day: "numeric" })}):</span>{" "}
                  {summarizeEntry(e.lastTime, units) || "done"} <span className="text-primary-600">· History ›</span>
                </>
              ) : (
                <>First time logging this <span className="text-primary-600">· History ›</span></>
              )}
            </button>

            <label className="mt-3 block">
              <span className="sr-only">Result</span>
              <textarea
                rows={1}
                value={e.resultText}
                onChange={(ev) => update(e.id, { resultText: ev.target.value })}
                placeholder={`Result, e.g. 3×8 @ 135 ${units}`}
                className="block w-full resize-none rounded-xl border border-gray-300 px-3 py-2 text-base text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:ring-primary-500"
              />
            </label>

            <div className="mt-3">
              <p className="text-xs font-semibold text-gray-500">RPE (optional)</p>
              <div className="mt-1 grid grid-cols-10 gap-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => update(e.id, { rpe: e.rpe === n ? null : n })}
                    className={`rounded-md py-1.5 text-sm font-semibold ${e.rpe === n ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-700"}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {showSets[e.id] ? (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-[2rem_1fr_1fr_1fr_1.5rem] gap-2 text-[11px] font-semibold uppercase text-gray-500">
                  <span>Set</span><span>{units}</span><span>Reps</span><span>RPE</span><span />
                </div>
                {e.sets.map((s, i) => (
                  <div key={i} className="grid grid-cols-[2rem_1fr_1fr_1fr_1.5rem] items-center gap-2">
                    <span className="text-sm font-semibold text-gray-600">{i + 1}</span>
                    <input inputMode="decimal" value={s.weight ?? ""} onChange={(ev) => updateSet(e, i, { weight: numOrNull(ev.target.value) })} className="w-full min-w-0 rounded-lg border border-gray-300 px-2 py-2 text-base" />
                    <input inputMode="numeric" value={s.reps ?? ""} onChange={(ev) => updateSet(e, i, { reps: numOrNull(ev.target.value) })} className="w-full min-w-0 rounded-lg border border-gray-300 px-2 py-2 text-base" />
                    <input inputMode="decimal" value={s.rpe ?? ""} onChange={(ev) => updateSet(e, i, { rpe: numOrNull(ev.target.value) })} className="w-full min-w-0 rounded-lg border border-gray-300 px-2 py-2 text-base" />
                    <button aria-label="Remove set" onClick={() => update(e.id, { sets: e.sets.filter((_, j) => j !== i) })} className="text-gray-400">×</button>
                  </div>
                ))}
                <button
                  onClick={() => update(e.id, { sets: [...e.sets, { ...(e.sets[e.sets.length - 1] ?? { reps: null, weight: null, rpe: null }) }] })}
                  className="text-sm font-semibold text-primary-600"
                >
                  + Add set
                </button>
              </div>
            ) : (
              <button onClick={() => openSets(e)} className="mt-3 text-sm font-semibold text-primary-600">+ Log sets (weight × reps)</button>
            )}
          </li>
        ))}
      </ol>

      <TextBlock title="Cool-down" text={workout.cooldown} />

      {workout.comments.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Comments</h2>
          <ul className="mt-2 space-y-2">
            {workout.comments.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="font-semibold text-gray-800">{c.author}:</span> <span className="text-gray-700">{c.body}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {exercises.length > 0 && (
        <section className="space-y-3">
          <textarea
            rows={2}
            value={notes}
            onChange={(ev) => {
              setNotes(ev.target.value)
              notesDirty.current = true
              schedule()
            }}
            placeholder="How did it go? (optional note for your coach)"
            className="block w-full rounded-xl border border-gray-300 px-3 py-2 text-base"
          />
          <button
            onClick={finish}
            disabled={finishing}
            className="w-full rounded-xl bg-primary-600 py-4 text-lg font-bold text-white disabled:opacity-60"
          >
            {finishing ? "Saving…" : workout.isCompleted ? "Save changes" : "Finish workout"}
          </button>
        </section>
      )}

      {videoIndex !== null && <VideoPlayer items={videos} startIndex={videoIndex} onClose={() => setVideoIndex(null)} />}

      {historyFor && (
        <ExerciseHistorySheet exerciseId={historyFor.exerciseId} name={historyFor.name} units={units} onClose={() => setHistoryFor(null)} />
      )}
    </div>
  )
}
