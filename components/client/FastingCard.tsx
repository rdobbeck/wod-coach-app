'use client'

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { clockLabel, fastHours, formatDuration, inEatingWindow, msUntil, type FastEntry } from "@/lib/fasting"

/**
 * Fasting status on Today: where the client is in their window right now, a live
 * timer for an open fast, and one button to start it or to log that they ate.
 */
export default function FastingCard({
  protocol,
  targetHours,
  windowStart,
  windowEnd,
  openFast,
  recent,
}: {
  protocol: string
  targetHours: number
  windowStart: string
  windowEnd: string
  openFast: FastEntry | null
  recent: FastEntry[]
}) {
  const router = useRouter()
  const [now, setNow] = useState<Date | null>(null)
  const [busy, setBusy] = useState(false)

  // Ticks once a second; rendered only in the browser so server and client agree.
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  if (!now) return null

  const eating = inEatingWindow(now, windowStart, windowEnd)
  const elapsed = openFast ? now.getTime() - new Date(openFast.startedAt).getTime() : 0
  const target = (openFast?.targetHours ?? targetHours) * 3_600_000
  const progress = openFast ? Math.min(elapsed / target, 1) : 0
  const hitTarget = openFast && elapsed >= target

  const act = async (action: "start" | "end") => {
    setBusy(true)
    const res = await fetch("/api/fasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })
    setBusy(false)
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't save that")
    toast.success(action === "start" ? "Fast started" : `Fast logged: ${formatDuration(elapsed)}`)
    router.refresh()
  }

  const lastThree = recent.filter((f) => f.endedAt).slice(0, 3)

  return (
    <section className="rounded-2xl border border-app-border bg-app-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-app-muted">
            Fasting · {protocol}
          </p>
          <p className="mt-1 font-display text-3xl font-bold leading-none">
            {openFast ? formatDuration(elapsed) : eating ? "Eating window" : "Not fasting"}
          </p>
          <p className="mt-1 text-sm text-app-muted">
            {openFast
              ? hitTarget
                ? `Target ${openFast.targetHours}h reached`
                : `${formatDuration(target - elapsed)} to ${openFast.targetHours}h`
              : eating
                ? `Window closes at ${clockLabel(windowEnd)}, in ${formatDuration(msUntil(now, windowEnd))}`
                : `Window opens at ${clockLabel(windowStart)}, in ${formatDuration(msUntil(now, windowStart))}`}
          </p>
        </div>
        {openFast && (
          <span
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${
              hitTarget ? "border-app-good text-app-good" : "border-app-accent"
            }`}
          >
            {Math.round(progress * 100)}%
          </span>
        )}
      </div>

      {openFast && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-app-surface2">
          <div className={`h-full rounded-full ${hitTarget ? "bg-app-good" : "bg-app-accent"}`} style={{ width: `${progress * 100}%` }} />
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {openFast ? (
          <button
            onClick={() => act("end")}
            disabled={busy}
            className="h-12 flex-1 rounded-xl bg-app-accent font-display text-lg font-bold uppercase tracking-[0.06em] text-app-accent-text disabled:opacity-60"
          >
            I ate
          </button>
        ) : (
          <button
            onClick={() => act("start")}
            disabled={busy}
            className="h-12 flex-1 rounded-xl border border-app-border font-display text-lg font-bold uppercase tracking-[0.06em] disabled:opacity-60"
          >
            Start fast
          </button>
        )}
      </div>

      {lastThree.length > 0 && (
        <ul className="mt-3 flex gap-2 text-xs text-app-muted">
          {lastThree.map((f) => {
            const hours = fastHours(f)
            return (
              <li key={f.id} className="flex-1 rounded-lg bg-app-surface2 px-2 py-1.5 text-center">
                <span className={`block font-display text-base font-bold ${hours >= f.targetHours ? "text-app-good" : "text-app-text"}`}>
                  {hours.toFixed(1)}h
                </span>
                {new Date(f.endedAt!).toLocaleDateString("en-US", { weekday: "short" })}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
