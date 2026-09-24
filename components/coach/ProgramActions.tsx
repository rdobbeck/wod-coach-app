'use client'

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

/** Next Monday as YYYY-MM-DD: the usual first day of a new block. */
const nextMonday = () => {
  const d = new Date()
  d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * Per-program controls on the client page: move the start, publish/unpublish,
 * copy onto a client (any of them, this one included), and remove (two taps).
 */
export default function ProgramActions({
  programId,
  name,
  isDraft,
  startDate,
  clientId,
  clients,
}: {
  programId: string
  name: string
  isDraft: boolean
  /** YYYY-MM-DD; shown in the date box so the coach can move the block. */
  startDate: string
  /** The client whose page this is; the default copy target. */
  clientId: string
  /** Everyone the coach could copy this program onto. */
  clients: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [copying, setCopying] = useState(false)
  const [copyTo, setCopyTo] = useState(clientId)
  const [copyStart, setCopyStart] = useState(nextMonday)

  const copy = async () => {
    setBusy(true)
    const res = await fetch(`/api/programs/${programId}/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: copyTo, startDate: copyStart }),
    })
    setBusy(false)
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't copy the program")
    const d = await res.json()
    const who = clients.find((c) => c.id === copyTo)?.name ?? "the client"
    toast.success(`${name} copied to ${who} as a draft (${d.workouts} sessions). Review it, then publish.`)
    setCopying(false)
    if (copyTo === clientId) router.refresh()
    else router.push(`/coach/clients/${copyTo}`)
  }

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
    <span className="flex shrink-0 flex-wrap items-center gap-3 text-xs font-semibold">
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
      <button onClick={() => setCopying((c) => !c)} disabled={busy} aria-expanded={copying} className="text-[#16181d] disabled:opacity-50">
        Copy to…
      </button>
      <button onClick={remove} disabled={busy} className={`disabled:opacity-50 ${confirmRemove ? "rounded bg-red-600 px-2 py-0.5 text-white" : "text-red-600"}`}>
        {confirmRemove ? "Tap again to remove" : "Remove"}
      </button>
      {copying && (
        <span className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-[#f6f3ee] px-3 py-2 font-normal text-[#4a443c]">
          <label className="flex items-center gap-1">
            Client
            <select
              aria-label="Copy to client"
              value={copyTo}
              onChange={(e) => setCopyTo(e.target.value)}
              className="rounded-md border border-[#ddd7cc] bg-white px-2 py-1 text-xs text-[#16181d]"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            Starting
            <input
              type="date"
              aria-label="Copy start date"
              value={copyStart}
              onChange={(e) => setCopyStart(e.target.value)}
              className="rounded-md border border-[#ddd7cc] bg-white px-2 py-1 text-xs text-[#16181d]"
            />
          </label>
          <button onClick={copy} disabled={busy || !copyStart} className="rounded-md bg-[#16181d] px-3 py-1 font-semibold text-white disabled:opacity-50">
            Copy as draft
          </button>
        </span>
      )}
    </span>
  )
}
