'use client'

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

/** Draft (AI-generated, unpublished) program: publish it to the client or discard it. */
export default function DraftProgramBar({ programId, name, range }: { programId: string; name: string; range: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const publish = async () => {
    setBusy(true)
    const res = await fetch(`/api/programs/${programId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publish: true }),
    })
    setBusy(false)
    if (!res.ok) return toast.error("Couldn't publish")
    toast.success(`${name} published. The client can see it now.`)
    router.refresh()
  }
  const discard = async () => {
    if (!confirmDiscard) return setConfirmDiscard(true)
    setBusy(true)
    const res = await fetch(`/api/programs/${programId}`, { method: "DELETE" })
    setBusy(false)
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't discard")
    toast.success("Draft discarded")
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-violet-900">Draft: {name}</p>
        <p className="text-xs text-violet-800">{range} · only you can see it. Review the workouts below, then publish.</p>
      </div>
      <button onClick={publish} disabled={busy} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        Publish to client
      </button>
      <button onClick={discard} disabled={busy} className={`rounded-lg px-3 py-2 text-sm font-semibold ${confirmDiscard ? "bg-red-600 text-white" : "text-red-600"}`}>
        {confirmDiscard ? "Tap again to discard" : "Discard"}
      </button>
    </div>
  )
}
