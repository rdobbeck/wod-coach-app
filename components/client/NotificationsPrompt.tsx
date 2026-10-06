'use client'

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { enablePush, getPushState, type PushState } from "@/lib/push-client"

const BELL = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
)

/** Asks for permission from a tap and reports the outcome. */
function useEnable(setState: (s: PushState) => void) {
  const [busy, setBusy] = useState(false)
  const enable = async () => {
    setBusy(true)
    try {
      const next = await enablePush()
      setState(next)
      if (next === "on") toast.success("Notifications on for this device")
    } catch {
      toast.error("Couldn't turn notifications on")
    } finally {
      setBusy(false)
    }
  }
  return { busy, enable }
}

/** The tour's notifications step: turn them on right there when this browser can. */
export function NotificationsStepBody() {
  const [state, setState] = useState<PushState | "loading">("loading")
  const { busy, enable } = useEnable(setState)
  useEffect(() => {
    getPushState().then(setState, () => setState("unsupported"))
  }, [])

  return (
    <>
      <p>Get a notification when a new program lands or a note comes back from your coach.</p>
      {state === "off" && (
        <button
          onClick={enable}
          disabled={busy}
          className="mt-4 h-11 rounded-xl border border-app-accent px-4 text-sm font-semibold text-app-accent disabled:opacity-50"
        >
          {busy ? "Turning on..." : "Turn on notifications"}
        </button>
      )}
      {state === "on" && <p className="mt-3 font-semibold text-app-text">They&rsquo;re on for this phone.</p>}
      {state === "blocked" && <p className="mt-3">They&rsquo;re blocked for this site. Allow them in your browser settings, then turn them on in Settings.</p>}
      <p className="mt-3">Settings is also where you change the colours, switch between lb and kg, and run this tour again.</p>
    </>
  )
}

const DISMISSED = "wod:push-prompt-dismissed"

/**
 * One-time ask on Today, for clients who've finished the tour but never turned
 * notifications on here. Mostly this is the first launch from the Home Screen on
 * an iPhone: the tour in Safari leaves the ask out (Apple won't allow it there)
 * and points here instead. "Not now" is
 * remembered per device; Settings keeps the toggle.
 */
export default function NotificationsPrompt() {
  const [open, setOpen] = useState(false)
  const { busy, enable } = useEnable(() => {})

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISSED)) return
    } catch {}
    let cancelled = false
    getPushState()
      .then((s) => {
        // "default" only: never re-ask someone who has already said no to the browser.
        if (!cancelled && s === "off" && Notification.permission === "default") setTimeout(() => !cancelled && setOpen(true), 1200)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!open) return null

  const close = () => {
    try {
      localStorage.setItem(DISMISSED, new Date().toISOString())
    } catch {}
    setOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Turn on notifications">
      <div className="w-full max-w-sm rounded-3xl border border-app-border bg-app-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-app-text shadow-2xl">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-app-surface2 text-app-accent">{BELL}</span>
        <h2 className="mt-4 font-display text-3xl font-bold leading-tight">Turn on notifications</h2>
        <p className="mt-3 text-sm leading-relaxed text-app-muted">
          Know the moment a new program lands or your coach replies. You can turn them off any time in Settings.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <button onClick={close} className="rounded-xl border border-app-border px-4 py-3 text-sm font-semibold text-app-muted">
            Not now
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              await enable()
              close()
            }}
            className="h-12 flex-1 rounded-xl bg-app-accent font-display text-lg font-bold uppercase tracking-[0.06em] text-app-accent-text disabled:opacity-50"
          >
            {busy ? "Turning on..." : "Turn on"}
          </button>
        </div>
      </div>
    </div>
  )
}
