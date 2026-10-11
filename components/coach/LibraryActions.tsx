"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

/**
 * The two ways a coach changes the library from the library page: add a new
 * exercise, and set or clear the demo video on an existing one. Both save
 * through the API and then refresh the page so the card grid is re-read.
 */

const isHttp = (s: string) => /^https?:\/\//.test(s.trim())
const INPUT = "w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
const PRIMARY = "rounded bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
const QUIET = "rounded border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"

export function AddExerciseButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [video, setVideo] = useState("")
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!name.trim()) return toast.error("Give it a name")
    if (video.trim() && !isHttp(video)) return toast.error("Video link must start with http")
    setBusy(true)
    const res = await fetch("/api/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), videoUrl: video.trim() || null }),
    }).catch(() => null)
    setBusy(false)
    const d = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) return toast.error(d.error ?? "Couldn't add exercise")
    toast.success(`Added “${d.exercise.name}” to your library`)
    setName("")
    setVideo("")
    setOpen(false)
    router.push(`/coach/library?q=${encodeURIComponent(d.exercise.name)}`)
    router.refresh()
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
        New exercise
      </button>
    )
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      className="grid w-full gap-2 rounded-lg bg-white p-3 shadow sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
      aria-label="New exercise"
    >
      <label className="text-xs text-gray-600">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder="90-90 Hip Lift" autoFocus />
      </label>
      <label className="text-xs text-gray-600">
        Video link (optional)
        <input value={video} onChange={(e) => setVideo(e.target.value)} className={INPUT} placeholder="https://youtu.be/…" inputMode="url" />
      </label>
      <button type="submit" disabled={busy} className={PRIMARY}>
        {busy ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className={QUIET}>
        Cancel
      </button>
    </form>
  )
}

export function VideoButton({ id, name, videoUrl }: { id: string; name: string; videoUrl: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(videoUrl ?? "")
  const [busy, setBusy] = useState(false)

  const save = async (next: string) => {
    if (next && !isHttp(next)) return toast.error("Video link must start with http")
    setBusy(true)
    const res = await fetch(`/api/exercises/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl: next || null }),
    }).catch(() => null)
    setBusy(false)
    const d = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) return toast.error(d.error ?? "Couldn't save the video")
    toast.success(next ? `Video saved for ${name}` : `Video removed from ${name}`)
    setValue(next)
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-primary-600 hover:underline">
        {videoUrl ? "Change video" : "Add video"}
      </button>
    )
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save(value.trim())
      }}
      className="w-full space-y-1.5"
      aria-label={`Video for ${name}`}
    >
      <input value={value} onChange={(e) => setValue(e.target.value)} className={INPUT} placeholder="https://youtu.be/…" inputMode="url" autoFocus />
      <div className="flex flex-wrap gap-1.5">
        <button type="submit" disabled={busy} className={PRIMARY}>
          {busy ? "Saving…" : "Save"}
        </button>
        {videoUrl && (
          <button type="button" disabled={busy} onClick={() => void save("")} className={QUIET}>
            Remove video
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setValue(videoUrl ?? "")
            setOpen(false)
          }}
          className={QUIET}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
