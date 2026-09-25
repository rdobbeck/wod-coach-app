'use client'

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

/** What the calendar says about this client's sessions. Dates arrive as ISO strings. */
export type SessionsInfo = {
  used: number | null
  size: number | null
  left: number | null
  packageDone: boolean
  next: { startsAt: string; endsAt: string | null } | null
  paymentDue: boolean
  estimated: boolean
}

const when = (iso: string) => {
  const d = new Date(iso)
  return {
    day: d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  }
}

/**
 * The client's own view of where they are: the next session on the calendar,
 * how many of the package are used, and whether payment is due. Read from the
 * coach's calendar, so it matches what the coach sees.
 */
export default function SessionsCard({ info, coachName }: { info: SessionsInfo; coachName: string | null }) {
  const router = useRouter()

  // Quietly bring the counter up to date. The server only reads the calendar if the last read is old.
  useEffect(() => {
    let live = true
    fetch("/api/sessions/refresh", { method: "POST" })
      .then((r) => r.json())
      .then((d) => live && d.refreshed && router.refresh())
      .catch(() => {})
    return () => {
      live = false
    }
  }, [router])

  const next = info.next ? when(info.next.startsAt) : null
  const pips = info.size && info.size <= 20 ? Array.from({ length: info.size }, (_, i) => i < (info.used ?? 0)) : null

  return (
    <section className="rounded-2xl border border-app-border bg-app-surface p-4" aria-label="Your sessions">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-app-muted">Your sessions</p>

      {next ? (
        <div className="mt-1">
          <p className="font-display text-2xl font-bold leading-tight">{next.day}</p>
          <p className="text-sm text-app-muted">
            {next.time}
            {coachName ? ` with ${coachName}` : ""}
          </p>
        </div>
      ) : (
        <p className="mt-1 text-sm text-app-muted">No session on the calendar yet.</p>
      )}

      {info.left != null && info.size != null && (
        <div className="mt-3">
          {pips && (
            <div className="flex gap-1" aria-hidden="true">
              {pips.map((used, i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${used ? "bg-app-accent" : "bg-app-surface2"}`} />
              ))}
            </div>
          )}
          <p className="mt-1.5 text-sm">
            <span className="font-semibold">
              {info.left} of {info.size}
            </span>{" "}
            <span className="text-app-muted">
              {info.packageDone ? "used. This package is finished." : info.left === 1 ? "session left" : "sessions left"}
              {info.estimated && !info.packageDone ? " (estimated)" : ""}
            </span>
          </p>
        </div>
      )}

      {info.paymentDue && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-app-surface2 px-3 py-2.5">
          <span className="text-sm font-semibold">Payment due</span>
          <Link href="/client/messages" className="text-sm font-semibold text-app-accent">
            Message {coachName ?? "your coach"} &rsaquo;
          </Link>
        </div>
      )}

      {(info.packageDone || (info.left != null && info.left <= 1)) && !info.paymentDue && (
        <Link href="/client/book" className="mt-3 block rounded-xl bg-app-accent px-4 py-2.5 text-center font-display text-base font-bold uppercase tracking-[0.06em] text-app-accent-text">
          Book your next session
        </Link>
      )}
    </section>
  )
}
