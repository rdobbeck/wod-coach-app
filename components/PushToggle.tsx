'use client'

import { useEffect, useState } from "react"
import { toast } from "sonner"

/** Base64url to the Uint8Array the Push API wants. */
function urlB64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(padded)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

type State = "loading" | "unsupported" | "needs-install" | "off" | "on" | "blocked"

/**
 * Turns notifications on for this device. iPhone only allows push once the app
 * is on the Home Screen, so that case gets its own instructions rather than a
 * permission prompt that would silently fail.
 */
export default function PushToggle({ tone = "client" }: { tone?: "client" | "coach" }) {
  const [state, setState] = useState<State>("loading")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const run = async () => {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        return setState(isIOS && !standalone ? "needs-install" : "unsupported")
      }
      if (Notification.permission === "denied") return setState("blocked")
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      setState(sub ? "on" : "off")
    }
    run().catch(() => setState("unsupported"))
  }, [])

  const enable = async () => {
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off")
        return
      }
      const reg = await navigator.serviceWorker.register("/sw.js")
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      })
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      })
      if (!res.ok) throw new Error("save failed")
      setState("on")
      toast.success("Notifications on for this device")
    } catch (e) {
      toast.error("Couldn't turn notifications on")
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
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
              ? "This device gets a notification for new messages, comments, and new programs."
              : "Get a notification when a message, comment, or new program comes in."}
          </p>
          <button onClick={state === "on" ? disable : enable} disabled={busy} className={`mt-3 ${state === "on" ? btnOff : btnOn}`}>
            {state === "on" ? "Turn off on this device" : "Turn on"}
          </button>
        </>
      )}
    </section>
  )
}
