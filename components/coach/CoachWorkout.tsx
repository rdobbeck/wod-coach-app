'use client'

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import CommentThread from "@/components/CommentThread"
import ExerciseHistorySheet from "@/components/ExerciseHistorySheet"
import { summarizeEntry, type HistoryEntry } from "@/lib/training-format"
import VideoPlayer, { type PlayerItem } from "@/components/VideoPlayer"

type Logged = Pick<HistoryEntry, "resultText" | "rpe" | "sets">
type Ex = {
  id?: string // absent for rows added in this edit session
  key: string // stable React key
  exerciseId: string | null
  name: string
  linked: boolean
  hasVideo: boolean
  videoUrl: string | null
  prescription: string
  supersetGroup: string
  lastTime: HistoryEntry | null
  logged: Logged | null
}
type W = {
  id: string
  name: string
  day: string
  originalDay: string | null
  isCompleted: boolean
  coachNotes: string
  warmup: string
  cooldown: string
  description: string | null
  clientNotes: string | null
  comments: { id: string; author: string; body: string; at?: string }[]
}

const fmt = (d: string, o: Intl.DateTimeFormatOptions = { weekday: "long", month: "short", day: "numeric" }) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" })

type Picked = { id: string | null; name: string; hasVideo: boolean; videoUrl: string | null }

function ExercisePicker({ onPick, placeholder = "Add exercise: search the library…", autoFocus = false }: { onPick: (e: Picked) => void; placeholder?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<{ id: string; name: string; videoUrl: string | null }[]>([])
  const [newVideo, setNewVideo] = useState<string | null>(null) // non-null = "new exercise" form open
  const [creating, setCreating] = useState(false)
  useEffect(() => {
    if (q.trim().length < 2) return setResults([])
    const t = setTimeout(() => {
      fetch(`/api/exercises/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setResults(d.results ?? []))
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q])
  const pick = (e: Picked) => {
    onPick(e)
    setQ("")
    setResults([])
    setNewVideo(null)
  }
  const create = async () => {
    setCreating(true)
    const res = await fetch("/api/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: q.trim(), videoUrl: newVideo }),
    })
    setCreating(false)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(d.error ?? "Couldn't add exercise")
    toast.success(`Added “${d.exercise.name}” to your library`)
    pick({ id: d.exercise.id, name: d.exercise.name, hasVideo: !!d.exercise.videoUrl, videoUrl: d.exercise.videoUrl })
  }
  return (
    <div className="relative">
      <input
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      {q.trim().length >= 2 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {results.map((r) => (
            <li key={r.id}>
              <button onClick={() => pick({ id: r.id, name: r.name, hasVideo: !!r.videoUrl, videoUrl: r.videoUrl })} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50">
                <span className="truncate">{r.name}</span>
                {r.videoUrl && <span className="ml-2 shrink-0 text-xs text-primary-600">▶</span>}
              </button>
            </li>
          ))}
          <li className="border-t border-gray-100">
            {newVideo === null ? (
              <button onClick={() => setNewVideo("")} className="w-full px-3 py-2 text-left text-sm font-semibold text-primary-700 hover:bg-gray-50">
                + New exercise “{q.trim()}” with a video link
              </button>
            ) : (
              <div className="flex gap-2 p-2">
                <input
                  autoFocus
                  value={newVideo}
                  onChange={(e) => setNewVideo(e.target.value)}
                  placeholder="Paste YouTube link"
                  className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
                <button onClick={create} disabled={creating} className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                  {creating ? "Adding…" : "Add"}
                </button>
              </div>
            )}
          </li>
          <li>
            <button onClick={() => pick({ id: null, name: q.trim(), hasVideo: false, videoUrl: null })} className="w-full px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50">
              Add “{q.trim()}” as text only (no video)
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

export default function CoachWorkout({
  clientId,
  workout,
  exercises: initial,
  units,
  startInEdit,
}: {
  clientId: string
  workout: W
  exercises: Omit<Ex, "key">[]
  units: string
  startInEdit: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(startInEdit)
  const [form, setForm] = useState({ name: workout.name, day: workout.day, coachNotes: workout.coachNotes, warmup: workout.warmup, cooldown: workout.cooldown })
  const [rows, setRows] = useState<Ex[]>(initial.map((e, i) => ({ ...e, key: e.id ?? `n${i}` })))
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState<Ex | null>(null)
  const [dupDate, setDupDate] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [changing, setChanging] = useState<string | null>(null) // row key whose exercise is being swapped
  const [videoIndex, setVideoIndex] = useState<number | null>(null)
  const videos: PlayerItem[] = rows.filter((r) => r.videoUrl).map((r) => ({ key: r.key, title: r.name, subtitle: r.prescription, url: r.videoUrl! }))
  const playVideo = (key: string) => setVideoIndex(Math.max(videos.findIndex((v) => v.key === key), 0))

  const setRow = (key: string, patch: Partial<Ex>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const move = (i: number, d: -1 | 1) =>
    setRows((rs) => {
      const j = i + d
      if (j < 0 || j >= rs.length) return rs
      const copy = rs.slice()
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })

  const save = async () => {
    setSaving(true)
    const res = await fetch(`/api/workouts/${workout.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        date: form.day,
        exercises: rows.map((r) => ({ id: r.id, exerciseId: r.exerciseId, name: r.name, prescription: r.prescription, supersetGroup: r.supersetGroup })),
      }),
    })
    setSaving(false)
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't save")
    toast.success("Workout saved")
    setEditing(false)
    router.replace(`/coach/clients/${clientId}/workouts/${workout.id}`)
    router.refresh()
  }

  const duplicate = async () => {
    if (!dupDate) return
    const res = await fetch(`/api/clients/${clientId}/workouts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: dupDate, copyFromWorkoutId: workout.id }),
    })
    if (!res.ok) return toast.error("Couldn't duplicate")
    toast.success(`Copied to ${fmt(dupDate, { month: "short", day: "numeric" })}`)
    router.push(`/coach/clients/${clientId}/workouts/${(await res.json()).id}`)
  }

  const remove = async () => {
    if (!confirmDelete) return setConfirmDelete(true)
    const res = await fetch(`/api/workouts/${workout.id}`, { method: "DELETE" })
    if (!res.ok) return toast.error("Couldn't delete")
    toast.success("Workout deleted")
    router.push(`/coach/clients/${clientId}`)
    router.refresh()
  }

  const LastTime = ({ r }: { r: Ex }) => (
    <button onClick={() => setHistory(r)} className="mt-2 block w-full rounded-md bg-gray-50 px-3 py-1.5 text-left text-xs text-gray-600">
      {r.lastTime ? (
        <>
          <span className="font-semibold text-gray-700">Last time ({fmt(r.lastTime.date, { month: "short", day: "numeric" })}):</span> {summarizeEntry(r.lastTime, units) || "done"}
        </>
      ) : (
        "No previous log"
      )}{" "}
      <span className="text-primary-600">· History ›</span>
    </button>
  )

  if (!editing) {
    return (
      <div className="mt-3 space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{workout.name}</h1>
              <p className="text-sm text-gray-600">
                {fmt(workout.day)}
                {workout.originalDay && <span className="text-gray-500"> · moved from {fmt(workout.originalDay, { month: "short", day: "numeric" })}</span>}
                {" · "}
                <span className={workout.isCompleted ? "font-semibold text-green-700" : "text-gray-600"}>{workout.isCompleted ? "Completed" : "Not completed"}</span>
              </p>
            </div>
            <button onClick={() => setEditing(true)} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white">Edit</button>
          </div>
          {workout.clientNotes && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><span className="font-semibold">Client note:</span> {workout.clientNotes}</p>}
          {[["Coach notes", workout.coachNotes], ["Notes", workout.description], ["Warm-up", workout.warmup]].map(([t, v]) =>
            v ? (
              <div key={t} className="mt-3">
                <p className="text-xs font-semibold uppercase text-gray-500">{t}</p>
                <p className="whitespace-pre-line text-sm text-gray-800">{v}</p>
              </div>
            ) : null
          )}
        </div>

        <ol className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.key} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-baseline justify-between gap-3">
                <button onClick={() => setHistory(r)} className="text-left font-semibold text-gray-900 hover:underline">
                  {i + 1}. {r.name}
                </button>
                <span className="flex shrink-0 items-center gap-2 text-xs text-gray-400">
                  {r.supersetGroup && `Group ${r.supersetGroup}`}
                  {r.videoUrl ? (
                    <button onClick={() => playVideo(r.key)} className="rounded-full bg-primary-50 px-2.5 py-0.5 font-semibold text-primary-700">▶ Video</button>
                  ) : (
                    !r.supersetGroup && (r.linked ? "library, no video" : "text only")
                  )}
                </span>
              </div>
              {r.prescription && <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{r.prescription}</p>}
              {r.logged ? (
                <div className="mt-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
                  <span className="font-semibold">Logged:</span>{" "}
                  {r.logged.sets.length
                    ? r.logged.sets.map((s) => `${s.weight ?? "-"}${s.weight !== null ? ` ${units}` : ""} × ${s.reps ?? "-"}${s.rpe !== null ? ` @${s.rpe}` : ""}`).join(" · ")
                    : null}
                  {r.logged.resultText && <span className="whitespace-pre-line"> {r.logged.resultText}</span>}
                  {r.logged.rpe !== null && <span> · RPE {r.logged.rpe}</span>}
                </div>
              ) : (
                workout.isCompleted && <p className="mt-2 text-xs text-gray-500">Nothing logged for this exercise.</p>
              )}
              <LastTime r={r} />
            </li>
          ))}
        </ol>

        {workout.cooldown && (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase text-gray-500">Cool-down</p>
            <p className="whitespace-pre-line text-sm text-gray-800">{workout.cooldown}</p>
          </div>
        )}
        <CommentThread workoutId={workout.id} initial={workout.comments} tone="coach" placeholder="Leave a note for your client" />

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            Duplicate to
            <input type="date" value={dupDate} onChange={(e) => setDupDate(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1 text-sm" />
          </label>
          <button onClick={duplicate} disabled={!dupDate} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 disabled:opacity-40">Duplicate</button>
          <button onClick={remove} className={`ml-auto rounded-md px-3 py-1.5 text-sm font-semibold ${confirmDelete ? "bg-red-600 text-white" : "text-red-600"}`}>
            {confirmDelete ? "Tap again to delete" : "Delete workout"}
          </button>
        </div>

        {videoIndex !== null && <VideoPlayer items={videos} startIndex={videoIndex} onClose={() => setVideoIndex(null)} />}
      {history && <ExerciseHistorySheet clientId={clientId} exerciseId={history.exerciseId} name={history.name} units={units} onClose={() => setHistory(null)} />}
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-4">
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Workout name" className="rounded-lg border border-gray-300 px-3 py-2 text-lg font-semibold" />
          <input type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} className="rounded-lg border border-gray-300 px-3 py-2" />
        </div>
        {(["coachNotes", "warmup", "cooldown"] as const).map((k) => (
          <label key={k} className="block">
            <span className="text-xs font-semibold uppercase text-gray-500">{{ coachNotes: "Coach notes", warmup: "Warm-up", cooldown: "Cool-down" }[k]}</span>
            <textarea rows={k === "coachNotes" ? 3 : 2} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
        ))}
      </div>

      <ol className="space-y-3">
        {rows.map((r, i) => (
          <li key={r.key} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-400">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate font-semibold text-gray-900">{r.name}</span>
              {r.videoUrl ? (
                <button onClick={() => playVideo(r.key)} className="shrink-0 text-[11px] font-semibold text-primary-600">▶</button>
              ) : (
                <span className="shrink-0 text-[11px] text-amber-600">{r.linked ? "no video" : "text only"}</span>
              )}
              <button onClick={() => setChanging(changing === r.key ? null : r.key)} className="shrink-0 px-1 text-xs font-semibold text-primary-600">
                {changing === r.key ? "Cancel" : "Change"}
              </button>
              <button onClick={() => move(i, -1)} className="px-1 text-gray-500" aria-label="Move up">↑</button>
              <button onClick={() => move(i, 1)} className="px-1 text-gray-500" aria-label="Move down">↓</button>
              <button onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="px-1 text-red-500" aria-label="Remove">✕</button>
            </div>
            {changing === r.key && (
              <div className="mt-2">
                <ExercisePicker
                  autoFocus
                  placeholder={`Replace “${r.name}”: search the library…`}
                  onPick={(e) => {
                    setRow(r.key, { exerciseId: e.id, name: e.name, linked: !!e.id, hasVideo: e.hasVideo, videoUrl: e.videoUrl })
                    setChanging(null)
                  }}
                />
              </div>
            )}
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_7rem]">
              <textarea rows={2} value={r.prescription} onChange={(e) => setRow(r.key, { prescription: e.target.value })} placeholder="Prescription, e.g. 4 x 6 @ RPE 7-8, rest 2 min" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={r.supersetGroup} onChange={(e) => setRow(r.key, { supersetGroup: e.target.value })} placeholder="Superset (A, B…)" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <LastTime r={r} />
          </li>
        ))}
      </ol>

      <ExercisePicker
        onPick={(e) =>
          setRows((rs) => [
            ...rs,
            { key: `n${Date.now()}`, exerciseId: e.id, name: e.name, linked: !!e.id, hasVideo: e.hasVideo, videoUrl: e.videoUrl, prescription: "", supersetGroup: "", lastTime: null, logged: null },
          ])
        }
      />

      <div className="flex gap-3">
        <button onClick={save} disabled={saving} className="flex-1 rounded-lg bg-primary-600 py-3 font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save workout"}</button>
        <button onClick={() => { setEditing(false); setRows(initial.map((e, i) => ({ ...e, key: e.id ?? `n${i}` }))) }} className="rounded-lg border border-gray-300 px-4 py-3 font-semibold text-gray-700">
          Cancel
        </button>
      </div>
      {videoIndex !== null && <VideoPlayer items={videos} startIndex={videoIndex} onClose={() => setVideoIndex(null)} />}
      {history && <ExerciseHistorySheet clientId={clientId} exerciseId={history.exerciseId} name={history.name} units={units} onClose={() => setHistory(null)} />}
    </div>
  )
}
