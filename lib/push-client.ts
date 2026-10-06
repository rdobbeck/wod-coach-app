/**
 * Browser side of push notifications, shared by the Settings toggle, the tour's
 * notifications step, and the one-time prompt on Today.
 */

export type PushState = "unsupported" | "needs-install" | "off" | "on" | "blocked"

/** Base64url to the Uint8Array the Push API wants. */
function urlB64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(padded)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (window.navigator as unknown as { standalone?: boolean }).standalone === true

/** iPhone only allows push once the app is on the Home Screen, so that case is its own state. */
export async function getPushState(): Promise<PushState> {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return isIOS && !isStandalone() ? "needs-install" : "unsupported"
  }
  if (Notification.permission === "denied") return "blocked"
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? "on" : "off"
}

/** Asks for permission and saves the subscription. Must run from a tap (iOS requires it). */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission()
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off"
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
  return "on"
}

export async function disablePush() {
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
}
