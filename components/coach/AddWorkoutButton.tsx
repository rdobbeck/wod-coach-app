'use client'

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

/** "+" on a calendar day: creates an empty workout there and opens it in the editor. */
export default function AddWorkoutButton({ clientId, date }: { clientId: string; date: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const add = async () => {
    setBusy(true)
    const res = await fetch(`/api/clients/${clientId}/workouts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    })
    setBusy(false)
    if (!res.ok) return toast.error("Couldn't add workout")
    router.push(`/coach/clients/${clientId}/workouts/${(await res.json()).id}?edit=1`)
  }
  return (
    <button onClick={add} disabled={busy} className="text-xs font-semibold text-[#c1272d] opacity-0 transition focus:opacity-100 group-hover:opacity-100 disabled:opacity-50 max-sm:opacity-100" aria-label={`Add workout on ${date}`}>
      + Add
    </button>
  )
}
