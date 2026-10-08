'use client'

import { useCallback, useEffect, useState } from "react"
import { detectBrowser, shouldShowInstallStep, type InstallBrowser } from "@/lib/install-prompt"
import { getPushState } from "@/lib/push-client"
import { InstallStepBody, arrowAtBottom } from "./InstallStep"
import { NotificationsStepBody } from "./NotificationsPrompt"
import { AskAiVisual, CallsVisual, LoggingVisual, NotificationVisual, RestVisual, TabsVisual, VideoVisual, WeekVisual } from "./TourVisuals"

/**
 * First-run walkthrough. It runs once, the first time a client opens Today,
 * and can be replayed from Settings: where things live, logging, the rest
 * timer, video form checks, free calls, moving sessions and Ask AI (when the
 * coach allows them), notifications, and (on a phone, in the browser) adding
 * it to the Home Screen.
 */
// `visual` is a small picture of the screen the slide talks about, shown in place of the icon.
// `raise` lifts the card clear of an arrow pointing at the bottom of the screen.
type Step = { id: string; title: string; icon: React.ReactNode; visual?: React.ReactNode; body: React.ReactNode; raise?: boolean }

const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

const TABS = [
  ["Today", "Your session, and every week ahead. Swipe the days to look forward"],
  ["History", "Everything you've done, and every lift you've logged"],
  ["Messages", "Talk to your coach, any time"],
  ["Settings", "Make it look and work how you want"],
]

function buildSteps({
  coachName,
  canBook,
  canMove,
  canAskAi,
  install,
  notifyAfterInstall,
}: {
  coachName: string
  canBook: boolean
  canMove: boolean
  canAskAi: boolean
  install: InstallBrowser | null
  // iPhone in the browser: Apple only lets Home Screen apps ask, so the ask
  // waits for the installed app (NotificationsPrompt) instead of a slide here.
  notifyAfterInstall: boolean
}): Step[] {
  const steps: Step[] = [
    {
      id: "tabs",
      title: "Here's where everything lives",
      icon: <Icon><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /></Icon>,
      visual: <TabsVisual />,
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
    {
      id: "logging",
      title: "Log a set without typing",
      icon: <Icon><path d="M20 6 9 17l-5-5" /></Icon>,
      visual: <LoggingVisual />,
      body: (
        <>
          <p>
            Open a session, tap an exercise, then <span className="font-semibold text-app-text">Log sets</span>. Tick set one and set two
            fills in with the same weight, so going up is one tap on the plus. The steppers move in 5 lb, or 2.5 kg.
          </p>
          <p className="mt-3">
            Want a different day as your starting point? Tap <span className="font-semibold text-app-text">Last time</span> to open your
            history for that lift, then <span className="font-semibold text-app-text">Use these numbers</span> on any day in the list.
          </p>
        </>
      ),
    },
    {
      id: "rest",
      title: "The rest timer runs itself",
      icon: <Icon><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" /></Icon>,
      visual: <RestVisual />,
      body: (
        <p>
          Tick a set and rest starts counting straight away, using whatever rest your program calls for. Pause or skip it from the timer
          at the bottom, or tap the time to change it. Your phone buzzes when you&apos;re back up.
        </p>
      ),
    },
    {
      id: "video",
      title: "Film a set and get it looked at",
      icon: <Icon><rect x="2" y="6" width="13" height="12" rx="2" /><path d="m15 11 6-3.5v9L15 13" /></Icon>,
      visual: <VideoVisual coachName={coachName} />,
      body: (
        <p>
          Every session has a comment box at the bottom. Tap the <span className="font-semibold text-app-text">+</span>, attach a video of the set you want eyes on, and
          {coachName ? ` ${coachName}` : " your coach"} replies right there on that session instead of somewhere you have to go looking.
        </p>
      ),
    },
  ]

  if (canBook) {
    steps.push({
      id: "calls",
      title: "Two free calls, every month",
      icon: <Icon><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Icon>,
      visual: <CallsVisual />,
      body: (
        <p>
          You get two 30 minute video calls a month. Tap <span className="font-semibold text-app-text">Book a call</span> on Today and
          pick a time that works. The count resets on the 1st, and Today always shows how many you&apos;ve got left.
        </p>
      ),
    })
  }

  if (canMove) {
    steps.push({
      id: "week",
      title: "Make the week fit your life",
      icon: <Icon><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M9 14h6" /></Icon>,
      visual: <WeekVisual />,
      body: (
        <>
          <p>
            Hold any session until your phone buzzes, then drag it onto the day you want in the week strip. Tap a day to see what&apos;s
            on it, and swipe the strip to look weeks ahead.
          </p>
          <p className="mt-3">
            Moving a few at once? Tap <span className="font-semibold text-app-text">Plan my week</span>, pick the days you can train, and
            you see exactly what moves before anything moves.
          </p>
        </>
      ),
    })
  }

  if (canAskAi) {
    steps.push({
      id: "askai",
      title: "Ask the AI about your training",
      icon: <Icon><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z" /></Icon>,
      visual: <AskAiVisual />,
      body: (
        <p>
          Tell it what&apos;s going on. A cranky shoulder, a week with only dumbbells, squats that felt easy. It reshapes your upcoming
          sessions. Nothing changes until you tap <span className="font-semibold text-app-text">Apply</span>, and{" "}
          {coachName || "your coach"} sees every change and can undo it.
        </p>
      ),
    })
  }

  if (!notifyAfterInstall) steps.push({
    id: "notifications",
    title: "Turn on notifications",
    icon: <Icon><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0" /></Icon>,
    visual: <NotificationVisual coachName={coachName} />,
    body: <NotificationsStepBody />,
  })

  if (install && install !== "desktop") {
    steps.push({
      id: "install",
      title: "Put WOD on your Home Screen",
      icon: <Icon><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M11 18h2" /></Icon>,
      body: <InstallStepBody browser={install} notifyAfter={notifyAfterInstall} />,
      raise: arrowAtBottom(install),
    })
  }

  return steps
}

export function TourDeck({
  coachName = "",
  canBook,
  canMove,
  canAskAi,
  onDone,
  onReachEnd,
}: {
  coachName?: string
  canBook: boolean
  canMove: boolean
  canAskAi: boolean
  onDone: (completed: boolean) => void
  /** Reaching the last slide counts as seen: on a phone they often leave from there to install. */
  onReachEnd?: () => void
}) {
  // Decided after mount: it depends on the browser, and the server can't know.
  const [install, setInstall] = useState<InstallBrowser | null>(null)
  const [notifyAfterInstall, setNotifyAfterInstall] = useState(false)
  useEffect(() => {
    if (shouldShowInstallStep()) setInstall(detectBrowser())
    getPushState().then((s) => setNotifyAfterInstall(s === "needs-install"), () => {})
  }, [])
  const steps = buildSteps({ coachName, canBook, canMove, canAskAi, install, notifyAfterInstall })
  const [i, setI] = useState(0)
  const step = steps[i]
  const last = i === steps.length - 1

  useEffect(() => {
    if (last) onReachEnd?.()
  }, [last, onReachEnd])

  const close = useCallback((completed: boolean) => onDone(completed), [onDone])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false)
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [close])

  return (
    <div className={`fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center ${step.raise ? "pb-28" : ""}`} role="dialog" aria-modal="true" aria-label="App walkthrough">
      <div className="max-h-full w-full max-w-sm overflow-y-auto rounded-3xl border border-app-border bg-app-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-app-text shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-1.5" aria-hidden="true">
            {steps.map((s, n) => (
              <span key={s.id} className={`h-1.5 rounded-full transition-all ${n === i ? "w-5 bg-app-accent" : "w-1.5 bg-app-surface2"}`} />
            ))}
          </div>
          {step.id === "install" ? (
            <button onClick={() => close(false)} aria-label="Close" className="-m-2 p-2 text-app-muted">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          ) : (
            <button onClick={() => close(false)} className="text-sm font-semibold text-app-muted">
              Skip
            </button>
          )}
        </div>

        {step.visual ? (
          <div className="mt-5">{step.visual}</div>
        ) : (
          <span className="mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-app-surface2 text-app-accent">{step.icon}</span>
        )}

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
export default function Tour({ seen, coachName, canBook, canMove, canAskAi }: { seen: boolean; coachName?: string; canBook: boolean; canMove: boolean; canAskAi: boolean }) {
  const [open, setOpen] = useState(!seen)
  const markSeen = useCallback(() => remember(true), [])
  if (!open) return null
  return (
    <TourDeck
      coachName={coachName}
      canBook={canBook}
      canMove={canMove}
      canAskAi={canAskAi}
      onReachEnd={markSeen}
      onDone={() => {
        setOpen(false)
        // Skipping counts as seen too, so it never ambushes them twice.
        remember(true)
      }}
    />
  )
}

/** Settings entry point, for anyone who skipped it or wants a reminder. */
export function ReplayTourButton({ canBook, canMove, canAskAi }: { canBook: boolean; canMove: boolean; canAskAi: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-app-border px-4 py-3 text-sm font-semibold text-app-text"
      >
        Show me around the app again
      </button>
      {open && <TourDeck canBook={canBook} canMove={canMove} canAskAi={canAskAi} onDone={() => setOpen(false)} />}
    </>
  )
}
