'use client'

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push-client"

type State = "loading" | PushState

/**
 * Turns notifications on for this device. iPhone only allows push once the app
 * is on the Home Screen, so that case gets its own instructions rather than a
 * permission prompt that would silently fail.
 */
export default function PushToggle({ tone = "client" }: { tone?: "client" | "coach" }) {
  const [state, setState] = useState<State>("loading")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getPushState().then(setState, () => setState("unsupported"))
  }, [])

  const enable = async () => {
    setBusy(true)
    try {
      const next = await enablePush()
      setState(next)
      if (next === "on") toast.success("Notifications on for this device")
    } catch (e) {
      toast.error("Couldn't turn notifications on")
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true)
    try {
      await disablePush()
      setState("off")
      toast.success("Notifications off for this device")
    } finally {
      setBusy(false)
    }
  }

  const client = tone === "client"
  const wrap = client ? "rounded-2xl border border-app-border bg-app-surface p-4" : "rounded-xl border border-gray-200 bg-white p-4"
  const head = client
    ? "font-display text-sm font-semibold uppercase tracking-[0.14em] text-app-muted"
    : "text-xs font-semibold uppercase text-gray-500"
  const muted = client ? "text-sm text-app-muted" : "text-sm text-gray-500"
  const btnOn = client
    ? "h-11 rounded-xl bg-app-accent px-5 font-display text-sm font-bold uppercase tracking-[0.06em] text-app-accent-text disabled:opacity-50"
    : "h-11 rounded-lg bg-gray-900 px-5 text-sm font-semibold text-white disabled:opacity-50"
  const btnOff = client
    ? "h-11 rounded-xl border border-app-border px-5 text-sm font-semibold text-app-text disabled:opacity-50"
    : "h-11 rounded-lg border border-gray-300 px-5 text-sm font-semibold text-gray-700 disabled:opacity-50"

  if (state === "loading") return null

  return (
    <section className={wrap}>
      <h2 className={head}>Notifications</h2>
      {state === "needs-install" && (
        <p className={`mt-2 ${muted}`}>
          On iPhone, tap Share then &ldquo;Add to Home Screen&rdquo;, open the app from there, and this button will appear.
        </p>
      )}
      {state === "unsupported" && <p className={`mt-2 ${muted}`}>This browser can&rsquo;t show notifications.</p>}
      {state === "blocked" && (
        <p className={`mt-2 ${muted}`}>Notifications are blocked. Allow them for this site in your browser settings, then reload.</p>
      )}
      {(state === "on" || state === "off") && (
        <>
          <p className={`mt-2 ${muted}`}>
            {state === "on"
              ? "This device gets a notification for new messages, comments, new programs, and when your rest is up while the phone is locked."
              : "Get a notification when a message, comment, or new program comes in, and when your rest is up while the phone is locked."}
          </p>
          <button onClick={state === "on" ? disable : enable} disabled={busy} className={`mt-3 ${state === "on" ? btnOff : btnOn}`}>
            {state === "on" ? "Turn off on this device" : "Turn on"}
          </button>
        </>
      )}
    </section>
  )
}
