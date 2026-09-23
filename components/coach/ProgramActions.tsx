'use client'

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

/** Per-program controls on the client page: publish/unpublish and remove (two taps). */
export default function ProgramActions({
  programId,
  name,
  isDraft,
  startDate,
}: {
  programId: string
  name: string
  isDraft: boolean
  /** YYYY-MM-DD; shown in the date box so the coach can move the block. */
  startDate: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const moveTo = async (date: string) => {
    if (!date || date === startDate) return
    setBusy(true)
    const res = await fetch(`/api/programs/${programId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: date }),
    })
    setBusy(false)
    if (!res.ok) return toast.error("Couldn't move the program")
    const d = await res.json()
    toast.success(
      `${name} starts ${new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` +
        `: ${d.movedWorkouts} workouts moved${d.keptCompleted ? `, ${d.keptCompleted} completed left in place` : ""}`
    )
    router.refresh()
  }

  const setPublished = async (publish: boolean) => {
    setBusy(true)
    const res = await fetch(`/api/programs/${programId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publish }),
    })
    setBusy(false)
    if (!res.ok) return toast.error("Couldn't update program")
    toast.success(publish ? `${name} published` : `${name} is back to draft (hidden from the client)`)
    router.refresh()
  }
  const remove = async () => {
    if (!confirmRemove) {
      setConfirmRemove(true)
      setTimeout(() => setConfirmRemove(false), 4000)
      return
    }
    setBusy(true)
    const res = await fetch(`/api/programs/${programId}`, { method: "DELETE" })
    setBusy(false)
    if (!res.ok) return toast.error("Couldn't remove program")
    const d = await res.json()
    toast.success(`Removed ${name}: ${d.removedWorkouts} workouts deleted${d.keptLoggedWorkouts ? `, ${d.keptLoggedWorkouts} logged workouts kept` : ""}`)
    router.refresh()
  }

  return (
    <span className="flex shrink-0 items-center gap-3 text-xs font-semibold">
      <label className="flex items-center gap-1 font-normal text-[#6b6257]">
        Starts
        <input
          type="date"
          defaultValue={startDate}
          disabled={busy}
          onChange={(e) => moveTo(e.target.value)}
          className="rounded-md border border-[#ddd7cc] px-2 py-1 text-xs text-[#16181d]"
        />
      </label>
      <button onClick={() => setPublished(isDraft)} disabled={busy} className="text-primary-600 disabled:opacity-50">
        {isDraft ? "Publish" : "Unpublish"}
      </button>
      <button onClick={remove} disabled={busy} className={`disabled:opacity-50 ${confirmRemove ? "rounded bg-red-600 px-2 py-0.5 text-white" : "text-red-600"}`}>
        {confirmRemove ? "Tap again to remove" : "Remove"}
      </button>
    </span>
  )
}
