'use client'

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { DEFAULT_MINUTES, eventCopy, googleCalendarUrl, timeLabel } from "@/lib/calendar-invite"

export type Schedulable = {
  id: string
  day: string
  name: string
  exerciseNames: string[]
  plan: { time: string; minutes: number } | null
  /** Moved to another day since it went into their calendar. */
  planStale?: boolean
}

const LENGTHS = [30, 45, 60, 75, 90, 120]
const dayLabel = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
const localTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

/**
 * "Schedule my session" (one session) and "Schedule my week" (several).
 * Step 1: pick when. Saving stores it, so the coach sees it and a moved session
 * keeps its time. Step 2: put it in their own calendar (Apple/Outlook .ics, or
 * Google, which only takes one event per link).
 */
export default function ScheduleSheet({
  sessions,
  week,
  label,
  className,
  defaultTime = "07:00",
  defaultMinutes = DEFAULT_MINUTES,
  bookHref,
  coachName,
}: {
  sessions: Schedulable[]
  week?: boolean
  label: string
  className?: string
  /** The time they picked last, so a habit is one tap. */
  defaultTime?: string
  defaultMinutes?: number
  /** Where "train with your coach instead" goes; hidden when the coach takes no bookings. */
  bookHref?: string | null
  coachName?: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<"when" | "add">("when")
  const [times, setTimes] = useState<Record<string, string>>({})
  const [minutes, setMinutes] = useState(defaultMinutes)
  const [same, setSame] = useState(true)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<string[]>([])
  // What this sheet just saved, so reopening it before the page refreshes shows the new time.
  const justSaved = useRef<{ times: Record<string, string | null>; minutes: number } | null>(null)
  // Signed .ics link: iOS downloads it without the app's login, so the link carries it.
  const [icsHref, setIcsHref] = useState<string | null>(null)
  const savedKey = saved.join(",")
  useEffect(() => {
    if (!open || step !== "add" || !savedKey) return
    let live = true
    setIcsHref(null)
    fetch("/api/plan/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: savedKey.split(",") }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setIcsHref(d?.url ?? null))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [open, step, savedKey])

  const start = () => {
    const t: Record<string, string> = {}
    const recent = justSaved.current
    const lastPicked = recent ? Object.values(recent.times).find((v): v is string => !!v) : undefined
    for (const s of sessions) {
      const r = recent?.times[s.id]
      t[s.id] = r !== undefined ? (r ?? lastPicked ?? defaultTime) : (s.plan?.time ?? lastPicked ?? defaultTime)
    }
    setTimes(t)
    setMinutes(recent?.minutes ?? sessions.find((s) => s.plan)?.plan?.minutes ?? defaultMinutes)
    // A week where everything shares one time starts in "same time" mode.
    setSame(new Set(Object.values(t)).size <= 1)
    // Moved since it went in their calendar: the time is still right, the calendar copy is not.
    const stale = !week && sessions[0]?.plan && sessions[0].planStale
    setSaved(stale ? [sessions[0].id] : [])
    setStep(stale ? "add" : "when")
    setOpen(true)
  }

  const save = async (clear = false) => {
    setBusy(true)
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tz: localTz(),
        items: sessions.map((s) => ({ id: s.id, time: clear ? null : times[s.id], ...(clear ? {} : { minutes }) })),
      }),
    }).catch(() => null)
    setBusy(false)
    if (!res?.ok) {
      toast.error((await res?.json().catch(() => ({})))?.error ?? "Couldn't save that")
      return
    }
    router.refresh()
    justSaved.current = { times: Object.fromEntries(sessions.map((s) => [s.id, clear ? null : times[s.id]])), minutes }
    if (clear) {
      toast.success("Time cleared")
      setOpen(false)
      return
    }
    setSaved(sessions.map((s) => s.id))
    setStep("add")
  }

  const google = (s: Schedulable) =>
    googleCalendarUrl({
      id: s.id,
      day: s.day,
      time: times[s.id] ?? s.plan?.time ?? defaultTime,
      minutes,
      tz: localTz(),
      url: `${window.location.origin}/client/workouts/${s.id}`,
      ...eventCopy(s.name, s.exerciseNames),
    })

  if (!sessions.length) return null
  const one = sessions.length === 1
  const hasPlan = one && !!sessions[0].plan

  return (
    <>
      <button onClick={start} className={className}>
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div
            role="dialog"
            aria-label={week ? "Schedule my week" : "Schedule my session"}
            className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl border-t border-app-border bg-app-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] font-sans text-app-text"
          >
            {step === "when" ? (
              <>
                <h2 className="font-display text-2xl font-bold">{week ? "When will you train this week?" : "When will you train?"}</h2>
                <p className="mt-1 text-sm text-app-muted">Put it in your calendar like any other appointment.</p>

                {week && !one && (
                  <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--app-accent-rgb))]" />
                    Same time every day
                  </label>
                )}

                {same || one ? (
                  <div className="mt-4">
                    {!one && (
                      <p className="mb-2 text-sm text-app-muted">
                        {sessions.map((s) => dayLabel(s.day).split(",")[0]).join(", ")}
                      </p>
                    )}
                    {one && (
                      <p className="mb-2 text-sm text-app-muted">
                        {sessions[0].name} · {dayLabel(sessions[0].day)}
                      </p>
                    )}
                    <input
                      type="time"
                      aria-label="Time"
                      value={times[sessions[0].id] ?? defaultTime}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v) setTimes(Object.fromEntries(sessions.map((s) => [s.id, v])))
                      }}
                      className="schedule-time block h-14 w-full rounded-xl border border-app-border bg-app-surface2 px-3 font-display text-2xl font-bold text-app-text"
                    />
                  </div>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {sessions.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 rounded-xl border border-app-border p-3">
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-app-muted">{dayLabel(s.day)}</span>
                          <span className="block truncate font-semibold">{s.name}</span>
                        </span>
                        <input
                          type="time"
                          aria-label={`Time for ${s.name}`}
                          value={times[s.id] ?? defaultTime}
                          onChange={(e) => e.target.value && setTimes((t) => ({ ...t, [s.id]: e.target.value }))}
                          className="schedule-time h-11 w-32 shrink-0 rounded-lg border border-app-border bg-app-surface2 px-2 font-semibold text-app-text"
                        />
                      </li>
                    ))}
                  </ul>
                )}

                <p className="mt-4 text-sm font-semibold">How long?</p>
                <div className="mt-2 grid grid-cols-6 gap-1.5">
                  {LENGTHS.map((m) => (
                    <button
                      key={m}
                      onClick={() => setMinutes(m)}
                      aria-pressed={minutes === m}
                      className={`rounded-lg border py-2 text-sm font-semibold ${minutes === m ? "border-app-accent bg-[rgba(var(--app-accent-rgb),0.15)]" : "border-app-border text-app-muted"}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-app-muted">minutes</p>

                <div className="mt-5 flex gap-2">
                  <button onClick={() => setOpen(false)} className="h-12 flex-1 rounded-xl border border-app-border text-sm font-semibold">
                    Cancel
                  </button>
                  <button
                    onClick={() => save()}
                    disabled={busy}
                    className="h-12 flex-[2] rounded-xl bg-app-accent font-display text-lg font-bold uppercase tracking-[0.06em] text-app-accent-text disabled:opacity-60"
                  >
                    {busy ? "Saving" : "Save time"}
                  </button>
                </div>

                {hasPlan && (
                  <button onClick={() => save(true)} disabled={busy} className="mt-3 w-full py-2 text-sm font-medium text-app-muted">
                    Clear my time
                  </button>
                )}

                {bookHref && (
                  <Link
                    href={bookHref}
                    className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-app-surface2 px-4 py-3 text-sm"
                  >
                    <span>
                      <span className="block font-semibold">Rather train with {coachName ?? "your coach"}?</span>
                      <span className="block text-app-muted">Book a session together</span>
                    </span>
                    <span aria-hidden="true">&rarr;</span>
                  </Link>
                )}
              </>
            ) : (
              <>
                <h2 className="font-display text-2xl font-bold">Add it to your calendar</h2>
                <p className="mt-1 text-sm text-app-muted">
                  {one
                    ? `${sessions[0].name}, ${dayLabel(sessions[0].day)} at ${timeLabel(times[sessions[0].id] ?? sessions[0].plan?.time ?? defaultTime)}. You'll get a reminder 30 minutes before.`
                    : `${saved.length} sessions saved. You'll get a reminder 30 minutes before each.`}
                </p>
                {!week && sessions[0]?.planStale && (
                  <p className="mt-3 rounded-xl border border-app-warn px-3 py-2 text-sm">
                    This session moved since you added it. Add it again, then delete the old one from your calendar.
                  </p>
                )}

                <a
                  href={icsHref ?? undefined}
                  aria-disabled={!icsHref}
                  className={`mt-5 flex h-14 items-center justify-center rounded-xl bg-app-accent font-display text-lg font-bold uppercase tracking-[0.06em] text-app-accent-text ${icsHref ? "" : "pointer-events-none opacity-60"}`}
                >
                  {one ? "Apple / Outlook calendar" : "Add all to Apple / Outlook"}
                </a>

                {one ? (
                  <a
                    href={google(sessions[0])}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex h-14 items-center justify-center rounded-xl border border-app-border font-display text-lg font-bold uppercase tracking-[0.06em]"
                  >
                    Google Calendar
                  </a>
                ) : (
                  <div className="mt-4">
                    <p className="text-sm font-semibold">Google Calendar, one at a time</p>
                    <ul className="mt-2 space-y-1.5">
                      {sessions.map((s) => (
                        <li key={s.id}>
                          <a
                            href={google(s)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between gap-3 rounded-xl border border-app-border px-3 py-2.5 text-sm"
                          >
                            <span className="min-w-0 truncate">
                              <span className="font-semibold">{dayLabel(s.day)}</span> · {timeLabel(times[s.id] ?? defaultTime)}
                            </span>
                            <span className="shrink-0 font-semibold text-app-accent">Add</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-5 flex gap-2">
                  <button onClick={() => setStep("when")} className="h-12 flex-1 rounded-xl border border-app-border text-sm font-semibold">
                    Change time
                  </button>
                  <button onClick={() => setOpen(false)} className="h-12 flex-1 rounded-xl border border-app-border text-sm font-semibold">
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
