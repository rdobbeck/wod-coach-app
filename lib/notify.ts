import webpush from "web-push"
import { prisma } from "./prisma"

/**
 * Notifications to a user's devices.
 *
 * Web push today: free, delivered by Apple/Google. On iPhone it only works once
 * the client adds the app to their Home Screen (iOS 16.4+); on Android it works
 * in the browser. SMS/email can be added as extra channels here later without
 * touching the callers.
 */
export type Notification = { title: string; body: string; url?: string; tag?: string }

let configured = false
function configure() {
  if (configured) return true
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return false
  try {
    // The subject must be a mailto: or https: URL, so it is a constant rather
    // than the site URL (which is http://localhost in development).
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:dobbecktraining@gmail.com", publicKey, privateKey)
    configured = true
  } catch (e) {
    console.warn("[notify] bad VAPID config:", (e as Error).message)
    return false
  }
  return true
}

/** Send to every device this user has registered. Never throws. */
export async function notifyUser(userId: string, n: Notification) {
  try {
    return await send(userId, n)
  } catch (e) {
    // Sending a message must never fail because a notification did.
    console.warn("[notify] skipped:", (e as Error).message)
    return { sent: 0, removed: 0 }
  }
}

async function send(userId: string, n: Notification) {
  if (!configure()) return { sent: 0, removed: 0 }
  const subs = await prisma.pushSubscription.findMany({ where: { userId } })
  let sent = 0
  let removed = 0

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: n.title, body: n.body, url: n.url ?? "/client", tag: n.tag })
        )
        sent++
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } })
      } catch (e) {
        // 404/410 mean the subscription is dead (app removed, permission revoked).
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined)
          removed++
        } else {
          console.warn("[notify] push failed:", status, (e as Error).message)
        }
      }
    })
  )
  return { sent, removed }
}
