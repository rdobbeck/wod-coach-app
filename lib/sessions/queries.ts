import { prisma } from "@/lib/prisma"
import { computeCounter, type Counter } from "./counter"

/** The counter for one client, from the sessions synced off the calendar. Null when none are matched to them. */
export async function counterForClient(clientId: string, now = new Date()): Promise<(Counter & { hasSessions: true }) | null> {
  const events = await prisma.sessionEvent.findMany({
    where: { clientIds: { has: clientId }, startsAt: { gte: new Date(now.getTime() - 200 * 86_400_000) } },
    select: { startsAt: true, endsAt: true, packageIndex: true, packageSize: true, needsPayment: true, paidOverride: true },
  })
  if (!events.length) return null
  return { ...computeCounter(events, now), hasSessions: true }
}
