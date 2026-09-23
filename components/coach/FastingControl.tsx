'use client'

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { PROTOCOLS } from "@/lib/fasting"

/**
 * Coach offers fasting to a client and sets the starting protocol. The client
 * can switch their own timer off in their settings, which shows here.
 */
export default function FastingControl({
  clientId,
  offered,
  enabled,
  protocol,
}: {
  clientId: string
  offered: boolean
  enabled: boolean
  protocol: string
}) {
  const router = useRouter()
  const [on, setOn] = useState(offered)
  const [busy, setBusy] = useState(false)

  const save = async (body: Record<string, unknown>, done: string) => {
    setBusy(true)
    const res = await fetch(`/api/clients/${clientId}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    setBusy(false)
    if (!res.ok) {
      setOn(offered)
      return toast.error("Couldn't save")
    }
    toast.success(done)
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-[#16181d]">
        <input
          type="checkbox"
          checked={on}
          disabled={busy}
          onChange={(e) => {
            setOn(e.target.checked)
            void save({ fastingEnabled: e.target.checked }, e.target.checked ? "Fasting timer on for this client" : "Fasting timer off")
          }}
          className="h-4 w-4 rounded border-[#ddd7cc]"
        />
        Fasting timer
      </label>
      {on && !enabled && <span className="text-xs text-[#857c70]">Client switched theirs off</span>}
      {on && (
        <div className="flex gap-1">
          {Object.entries(PROTOCOLS)
            .filter(([id]) => id !== "custom")
            .map(([id, p]) => (
              <button
                key={id}
                disabled={busy}
                onClick={() => void save({ fastingProtocol: id }, `Target set to ${p.fastHours}h`)}
                aria-pressed={protocol === id}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${protocol === id ? "border-[#c1272d] text-[#16181d]" : "border-[#ddd7cc] text-[#6b6257]"}`}
              >
                {p.label}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
