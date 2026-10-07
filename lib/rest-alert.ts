import { randomUUID } from "node:crypto"
import { prisma } from "./prisma"
import { notifyUser } from "./notify"

/**
 * "Rest's up" while the phone is locked.
 *
 * The rest timer on the phone stops ticking once the screen is off, so when a
 * client locks their phone mid-rest the page arms an alert here, and unlocking
 * disarms it. The server then has to wait out the rest, which a serverless
 * function can't do in one go: each invocation sleeps at most HOP_MS, re-reads
 * the row, and either calls itself for another hop or sends the push. A newer
 * rest replaces the row's nonce, which is how an old chain knows to stop.
 */
export const HOP_MS = 50_000
export const MAX_REST_MS = 15 * 60_000

export type Step = { kind: "hop"; sleepMs: number } | { kind: "fire"; sleepMs: number }

/** How long this invocation should sleep, and whether the push follows or another hop does. */
export function planStep(now: number, fireAt: number, hopMs = HOP_MS): Step {
  const remaining = Math.max(0, fireAt - now)
  return remaining > hopMs ? { kind: "hop", sleepMs: hopMs } : { kind: "fire", sleepMs: remaining }
}

export async function armRestAlert(userId: string, input: { workoutId: string; exercise: string; endsAt: number }) {
  const fireAt = new Date(Math.min(input.endsAt, Date.now() + MAX_REST_MS))
  const nonce = randomUUID()
  const data = { workoutId: input.workoutId, exercise: input.exercise.slice(0, 120), fireAt, nonce }
  await prisma.restAlert.upsert({ where: { userId }, update: data, create: { userId, ...data } })
  return nonce
}

export async function disarmRestAlert(userId: string) {
  await prisma.restAlert.deleteMany({ where: { userId } })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * One link in the chain. `next` schedules the following hop (an HTTP call to
 * ourselves on Vercel); without it, as in development, this invocation just
 * keeps sleeping until the alert is due.
 */
export async function runRestAlertHop(userId: string, nonce: string, next?: (userId: string, nonce: string) => Promise<void>) {
  for (;;) {
    const row = await prisma.restAlert.findUnique({ where: { userId } })
    if (!row || row.nonce !== nonce) return "superseded" as const
    const step = planStep(Date.now(), row.fireAt.getTime())
    await sleep(step.sleepMs)
    if (step.kind === "hop") {
      if (next) {
        await next(userId, nonce)
        return "hopped" as const
      }
      continue
    }
    // Re-read after the sleep: the phone may have come back and disarmed it.
    const fresh = await prisma.restAlert.findUnique({ where: { userId } })
    if (!fresh || fresh.nonce !== nonce) return "superseded" as const
    await prisma.restAlert.deleteMany({ where: { userId, nonce } })
    await notifyUser(userId, {
      title: "Rest's up",
      body: `Back to ${fresh.exercise}`,
      url: `/client/workouts/${fresh.workoutId}`,
      tag: "rest",
    })
    return "fired" as const
  }
}

/**
 * On Vercel, the next hop is an HTTP call to ourselves, protected by
 * CRON_SECRET like the cron routes. Without that secret (development) there is
 * no next hop and the first invocation waits out the whole rest itself.
 */
export function nextHop(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return undefined
  const origin = new URL(req.url).origin
  return async (userId: string, nonce: string) => {
    const res = await fetch(`${origin}/api/rest-alert/hop`, {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ userId, nonce }),
    })
    if (!res.ok) console.warn("[rest-alert] next hop refused:", res.status)
  }
}
