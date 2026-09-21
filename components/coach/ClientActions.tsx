'use client'

import { useState } from "react"
import { toast } from "sonner"

/** Invite link + per-client settings on the coach's client page. */
export default function ClientActions({ clientId, canMoveWorkouts, hasPassword }: { clientId: string; canMoveWorkouts: boolean; hasPassword: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [canMove, setCanMove] = useState(canMoveWorkouts)

  const invite = async () => {
    setBusy(true)
    const res = await fetch(`/api/clients/${clientId}/invite`, { method: "POST" })
    setBusy(false)
    if (!res.ok) return toast.error("Couldn't create invite link")
    setUrl((await res.json()).url)
  }
  const copy = async () => {
    await navigator.clipboard.writeText(url!).then(
      () => toast.success("Link copied. Text it to your client."),
      () => toast.error("Copy failed; select the link and copy it")
    )
  }
  const toggleMove = async () => {
    const next = !canMove
    setCanMove(next)
    const res = await fetch(`/api/clients/${clientId}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canMoveWorkouts: next }),
    })
    if (!res.ok) {
      setCanMove(!next)
      toast.error("Couldn't save setting")
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={invite} disabled={busy} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {hasPassword ? "New sign-in link" : "Invite to app"}
        </button>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={canMove} onChange={toggleMove} className="h-4 w-4 rounded border-gray-300" />
          Client can move workouts
        </label>
        {!hasPassword && <span className="text-xs text-gray-500">Not signed up yet</span>}
      </div>
      {url && (
        <div className="flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 p-2">
          <input readOnly value={url} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 bg-transparent text-sm text-gray-800" />
          <button onClick={copy} className="rounded-md bg-white px-3 py-1 text-sm font-semibold text-primary-700">Copy</button>
        </div>
      )}
    </div>
  )
}
