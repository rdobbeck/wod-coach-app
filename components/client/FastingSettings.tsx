'use client'

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { PROTOCOLS, clockLabel, windowHours } from "@/lib/fasting"

/** Client adjusts their protocol and eating window (the coach switches fasting on). */
export default function FastingSettings({
  protocol,
  windowStart,
  windowEnd,
}: {
  protocol: string
  windowStart: string
  windowEnd: string
}) {
  const router = useRouter()
  const [start, setStart] = useState(windowStart)
  const [end, setEnd] = useState(windowEnd)
  const [busy, setBusy] = useState(false)

  const save = async (body: Record<string, unknown>, done: string) => {
    setBusy(true)
    const res = await fetch("/api/client/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    setBusy(false)
    if (!res.ok) return toast.error("Couldn't save that")
    toast.success(done)
    router.refresh()
  }

  return (
    <div>
      <p className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-app-muted">Fasting</p>

      <div className="mt-2 grid grid-cols-4 gap-2">
        {Object.entries(PROTOCOLS)
          .filter(([id]) => id !== "custom")
          .map(([id, p]) => (
            <button
              key={id}
              disabled={busy}
              onClick={() => save({ fastingProtocol: id }, `Target set to ${p.fastHours}h`)}
              aria-pressed={protocol === id}
              className={`rounded-xl border py-3 font-display text-lg font-semibold ${protocol === id ? "border-app-accent" : "border-app-border text-app-muted"}`}
            >
              {p.label}
            </button>
          ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs text-app-muted">Eating window opens</span>
          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            onBlur={() => start !== windowStart && save({ eatingWindowStart: start }, `Window opens at ${clockLabel(start)}`)}
            className="mt-1 block w-full rounded-xl border border-app-border bg-app-bg px-3 py-2 text-base text-app-text"
          />
        </label>
        <label className="block">
          <span className="text-xs text-app-muted">Closes</span>
          <input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            onBlur={() => end !== windowEnd && save({ eatingWindowEnd: end }, `Window closes at ${clockLabel(end)}`)}
            className="mt-1 block w-full rounded-xl border border-app-border bg-app-bg px-3 py-2 text-base text-app-text"
          />
        </label>
      </div>
      <p className="mt-1 text-xs text-app-muted">
        {windowHours(start, end)}h window, {(24 - windowHours(start, end)).toFixed(1)}h fast. The timer on Today follows this.
      </p>
    </div>
  )
}
