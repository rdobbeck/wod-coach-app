import { prisma } from "@/lib/prisma"

/**
 * The AI spend cap. Every model call is written to AiUsage, and a call is
 * refused once this month's total reaches the cap.
 *
 *   AI_MONTHLY_CAP_USD   hard stop, default 25
 *   AI_WARN_FRACTION     when the meter turns amber, default 0.6
 *
 * A call already in flight can finish, so the most a month can overshoot is
 * one call (well under a dollar at the token limit set in assist.ts).
 */
export const monthlyCapUsd = () => {
  const n = Number(process.env.AI_MONTHLY_CAP_USD)
  return Number.isFinite(n) && n > 0 ? n : 25
}
export const warnFraction = () => {
  const n = Number(process.env.AI_WARN_FRACTION)
  return Number.isFinite(n) && n > 0 && n < 1 ? n : 0.6
}

export class AiCapError extends Error {
  code = "AI_CAP"
  constructor(public spent: number, public cap: number) {
    super(`The monthly AI limit of $${cap.toFixed(0)} is used up ($${spent.toFixed(2)} spent). It resets on the 1st.`)
  }
}

/** First instant of the month containing `at` (UTC), so the cap resets with the calendar. */
export const monthStart = (at = new Date()) => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1))

export async function spentThisMonth(coachId: string, at = new Date()) {
  const r = await prisma.aiUsage.aggregate({
    where: { coachId, createdAt: { gte: monthStart(at) } },
    _sum: { costUsd: true },
  })
  return r._sum.costUsd ?? 0
}

export type SpendMeter = { spent: number; cap: number; level: "ok" | "warn" | "capped" }

export async function spendMeter(coachId: string, at = new Date()): Promise<SpendMeter> {
  const spent = await spentThisMonth(coachId, at)
  const cap = monthlyCapUsd()
  return { spent, cap, level: spent >= cap ? "capped" : spent >= cap * warnFraction() ? "warn" : "ok" }
}

/** Throws AiCapError when the month's cap is already reached. Call before every model request. */
export async function assertUnderCap(coachId: string) {
  const m = await spendMeter(coachId)
  if (m.level === "capped") throw new AiCapError(m.spent, m.cap)
  return m
}

export const recordUsage = (row: {
  coachId: string
  clientId?: string | null
  kind: "assist" | "generate"
  model: string
  tokensIn?: number
  tokensOut?: number
  costUsd: number
}) =>
  prisma.aiUsage.create({
    data: {
      coachId: row.coachId,
      clientId: row.clientId ?? null,
      kind: row.kind,
      model: row.model,
      tokensIn: row.tokensIn ?? 0,
      tokensOut: row.tokensOut ?? 0,
      costUsd: row.costUsd,
    },
  })
