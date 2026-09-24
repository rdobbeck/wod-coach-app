'use client'

import { useCallback, useEffect, useState } from "react"

/**
 * First-run walkthrough. It runs once, the first time a client opens Today,
 * and can be replayed from Settings. It is deliberately short: where things
 * live, and turning notifications on. Everything else is learned in place:
 * one-time Hints on the workout screen (logging sets, the rest timer), the
 * comment box's placeholder (video form checks), and Today's own labels
 * (moving sessions, free calls).
 */
type Step = { id: string; title: string; icon: React.ReactNode; body: React.ReactNode }

const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

const TABS = [
  ["Today", "Your session, and every week ahead. Swipe the days to look forward"],
  ["History", "Everything you have done, and every lift you have logged"],
  ["Messages", "Talk to your coach, any time"],
  ["Settings", "Make it look and work how you want"],
]

function buildSteps(_: { coachName: string; canBook: boolean; canMove: boolean }): Step[] {
  const steps: Step[] = [
    {
      id: "tabs",
      title: "Here is where everything lives",
      icon: <Icon><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /></Icon>,
      body: (
        <>
          <ul className="space-y-2">
            {TABS.map(([name, what]) => (
              <li key={name} className="flex gap-2">
                <span className="w-[4.5rem] shrink-0 font-semibold text-app-text">{name}</span>
                <span>{what}</span>
              </li>
            ))}
          </ul>
        </>
      ),
    },
  ]

  steps.push({
    id: "notifications",
    title: "One last thing",
    icon: <Icon><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0" /></Icon>,
    body: (
      <>
        <p>
          Turn on notifications in <span className="font-semibold text-app-text">Settings</span> so you know when a new program lands or
          a note comes back. On an iPhone, add the app to your Home Screen first, or Apple will not let it send anything.
        </p>
        <p className="mt-3">Settings is also where you change the colours, switch between lb and kg, and run this tour again.</p>
      </>
    ),
  })

  return steps
}

export function TourDeck({
  coachName = "",
  canBook,
  canMove,
  onDone,
}: {
  coachName?: string
  canBook: boolean
  canMove: boolean
  onDone: (completed: boolean) => void
}) {
  const steps = buildSteps({ coachName, canBook, canMove })
  const [i, setI] = useState(0)
  const step = steps[i]
  const last = i === steps.length - 1

  const close = useCallback((completed: boolean) => onDone(completed), [onDone])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false)
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [close])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="App walkthrough">
      <div className="w-full max-w-sm rounded-3xl border border-app-border bg-app-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-app-text shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-1.5" aria-hidden="true">
            {steps.map((s, n) => (
              <span key={s.id} className={`h-1.5 rounded-full transition-all ${n === i ? "w-5 bg-app-accent" : "w-1.5 bg-app-surface2"}`} />
            ))}
          </div>
          <button onClick={() => close(false)} className="text-sm font-semibold text-app-muted">
            Skip
          </button>
        </div>

        <span className="mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-app-surface2 text-app-accent">{step.icon}</span>

        <h2 className="mt-4 font-display text-3xl font-bold leading-tight">{step.title}</h2>
        <div className="mt-3 text-sm leading-relaxed text-app-muted">{step.body}</div>

        <div className="mt-6 flex items-center gap-3">
          {i > 0 && (
            <button onClick={() => setI(i - 1)} className="rounded-xl border border-app-border px-4 py-3 text-sm font-semibold text-app-muted">
              Back
            </button>
          )}
          <button
            onClick={() => (last ? close(true) : setI(i + 1))}
            className="h-12 flex-1 rounded-xl bg-app-accent font-display text-lg font-bold uppercase tracking-[0.06em] text-app-accent-text"
          >
            {last ? "Start training" : "Next"}
          </button>
        </div>

        <p className="mt-3 text-center text-xs text-app-muted">
          {i + 1} of {steps.length} · you can run this again from Settings
        </p>
      </div>
    </div>
  )
}

/** Marks the tour as seen (or not) without blocking the client on the request. */
const remember = (seen: boolean) =>
  void fetch("/api/client/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tourSeen: seen }),
  }).catch(() => {})

/** Opens itself once, on a client's first visit to Today. */
export default function Tour({ seen, coachName, canBook, canMove }: { seen: boolean; coachName?: string; canBook: boolean; canMove: boolean }) {
  const [open, setOpen] = useState(!seen)
  if (!open) return null
  return (
    <TourDeck
      coachName={coachName}
      canBook={canBook}
      canMove={canMove}
      onDone={() => {
        setOpen(false)
        // Skipping counts as seen too, so it never ambushes them twice.
        remember(true)
      }}
    />
  )
}

/** Settings entry point, for anyone who skipped it or wants a reminder. */
export function ReplayTourButton({ canBook, canMove }: { canBook: boolean; canMove: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-app-border px-4 py-3 text-sm font-semibold text-app-text"
      >
        Show me around the app again
      </button>
      {open && <TourDeck canBook={canBook} canMove={canMove} onDone={() => setOpen(false)} />}
    </>
  )
}
