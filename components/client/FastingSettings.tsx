'use client'

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { PROTOCOLS, clockLabel, windowHours } from "@/lib/fasting"

/**
 * The client's fasting timer: on or off, which protocol, and the eating window.
 * The coach offers it; the client decides whether to actually run it.
 */
export default function FastingSettings({
  enabled,
  protocol,
  windowStart,
  windowEnd,
}: {
  enabled: boolean
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-app-muted">Fasting</p>
          <p className="mt-1 text-sm text-app-muted">
            {enabled ? "The timer shows on Today." : "Turn this on to track your eating window."}
          </p>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          aria-label="Fasting timer"
          disabled={busy}
          onClick={() => save({ fastingEnabled: !enabled }, enabled ? "Fasting timer off" : "Fasting timer on")}
          className={`mt-0.5 flex h-8 w-14 shrink-0 items-center rounded-full border px-1 transition-colors disabled:opacity-50 ${
            enabled ? "justify-end border-app-accent bg-app-accent" : "justify-start border-app-border bg-app-surface2"
          }`}
        >
          <span className={`h-6 w-6 rounded-full ${enabled ? "bg-app-accent-text" : "bg-app-muted"}`} />
        </button>
      </div>

      {enabled && (
        <>
          <div className="mt-3 grid grid-cols-4 gap-2">
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
        </>
      )}
    </div>
  )
}
