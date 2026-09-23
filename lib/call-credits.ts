import { prisma } from "./prisma"

/**
 * Free video calls per client, per calendar month.
 *
 * There is no stored balance. Usage is counted from the CallBooking rows in the
 * month a call is scheduled for, which means the allowance resets on its own at
 * the start of every month and a cancelled booking gives the credit straight
 * back. A coach's allowance is on their profile; 0 means unlimited.
 */
export type CallCredits = {
  allowance: number
  used: number
  left: number
  unlimited: boolean
  /** First day of the month after this one, for "resets on" copy. */
  resetsAt: Date
}

/** The month containing `when`, as a half-open [start, end) range in UTC. */
export function monthRange(when = new Date()) {
  const start = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), 1))
  const end = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth() + 1, 1))
  return { start, end }
}

export async function callCreditsFor(clientId: string, coachId: string, when = new Date()): Promise<CallCredits> {
  const { start, end } = monthRange(when)
  const [profile, used] = await Promise.all([
    prisma.coachProfile.findUnique({ where: { userId: coachId }, select: { monthlyCallCredits: true } }),
    prisma.callBooking.count({
      where: { clientId, coachId, cancelled: false, startsAt: { gte: start, lt: end } },
    }),
  ])

  const allowance = profile?.monthlyCallCredits ?? 2
  const unlimited = allowance <= 0
  return {
    allowance,
    used,
    left: unlimited ? Number.POSITIVE_INFINITY : Math.max(allowance - used, 0),
    unlimited,
    resetsAt: end,
  }
}

/** "2 free calls left this month" and friends. */
export function creditsLabel(c: CallCredits): string {
  if (c.unlimited) return "Book as many calls as you need."
  if (c.left <= 0) {
    const month = c.resetsAt.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })
    return `You have used both free calls this month. They reset on 1 ${month}.`
  }
  const n = c.left === 1 ? "1 free call" : `${c.left} free calls`
  return `${n} left this month.`
}
