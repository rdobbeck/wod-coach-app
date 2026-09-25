'use client'

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

/** Moves a client between current and past clients from the Clients list. */
export default function ClientStatusButton({ clientId, current, name }: { clientId: string; current: boolean; name: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button
      disabled={busy}
      onClick={async (e) => {
        e.preventDefault()
        e.stopPropagation()
        setBusy(true)
        const res = await fetch(`/api/clients/${clientId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: current ? "INACTIVE" : "ACTIVE" }),
        })
        setBusy(false)
        if (!res.ok) return toast.error((await res.json().catch(() => null))?.error ?? "Couldn't update")
        toast.success(current ? `${name} moved to past clients` : `${name} is a current client again`)
        router.refresh()
      }}
      className="shrink-0 rounded-lg border border-[#ddd7cc] px-2.5 py-1 text-xs font-semibold text-[#6b6257] hover:text-[#16181d] disabled:opacity-50"
    >
      {current ? "Move to past" : "Make current"}
    </button>
  )
}
