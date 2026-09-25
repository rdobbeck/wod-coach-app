import { prisma } from "@/lib/prisma"
import { isSealed, open, seal } from "@/lib/secret-box"
import { getCoachPlan } from "@/lib/plans"
import { monthStart, recordUsage } from "@/lib/ai/spend"

/**
 * Who pays for an AI call, checked in this order:
 *   1. byok       the coach saved their own OpenRouter key; OpenRouter bills them
 *   2. allowance  the plan's AI-built programs this month (our key, no charge)
 *   3. balance    pay-as-you-go: actual model cost plus MARKUP, taken from aiBalanceCents
 * Nothing left: AiFundingError (the route answers 402).
 */
export const MARKUP = 1.3

// Balance needed before a program is started. A 12-week program usually costs
// $0.50 to $1.00 of model time; the 32k-token ceiling is about $1.70, so $2.25
// with markup is the most one generation can take.
export const PROGRAM_ESTIMATE_CENTS = { low: 60, high: 225 }
// The assistant is far cheaper per message; this is the least balance that allows one.
export const ASSIST_MIN_CENTS = 10

export type Funding =
  | { mode: "byok"; apiKey: string; model: string | null }
  | { mode: "allowance"; left: number }
  | { mode: "balance"; balanceCents: number }

export class AiFundingError extends Error {
  code = "AI_FUNDS"
  constructor(message: string) {
    super(message)
  }
}

/** Marked-up price in cents for a model call that cost OpenRouter `costUsd`. */
export const chargeCents = (costUsd: number) => Math.ceil(costUsd * MARKUP * 100)

export const aiProgramsThisMonth = (userId: string) =>
  prisma.program.count({ where: { coachId: userId, programType: "AI_GENERATED", createdAt: { gte: monthStart() } } })

async function profileOf(userId: string) {
  const p = await prisma.coachProfile.findUnique({
    where: { userId },
    select: { id: true, aiProvider: true, openrouterApiKey: true, preferredModel: true, aiBalanceCents: true },
  })
  if (!p) throw new Error("Coach profile not found")
  return p
}

/** How the next AI-built program would be paid for, or null if it can't be. Never returns the key. */
export async function programFundingSummary(userId: string) {
  const p = await profileOf(userId)
  if (p.aiProvider === "BRING_YOUR_OWN_KEY" && p.openrouterApiKey) return { mode: "byok" as const, left: 0, balanceCents: p.aiBalanceCents }
  const { plan } = await getCoachPlan(userId)
  const left = Math.max(plan.aiPrograms - (await aiProgramsThisMonth(userId)), 0)
  if (left > 0) return { mode: "allowance" as const, left, balanceCents: p.aiBalanceCents }
  if (p.aiBalanceCents >= PROGRAM_ESTIMATE_CENTS.high) return { mode: "balance" as const, left: 0, balanceCents: p.aiBalanceCents }
  return { mode: "none" as const, left: 0, balanceCents: p.aiBalanceCents }
}

/** Decides who pays for one AI-built program. Throws AiFundingError when nobody can. */
export async function fundProgram(userId: string): Promise<Funding> {
  const p = await profileOf(userId)
  if (p.aiProvider === "BRING_YOUR_OWN_KEY" && p.openrouterApiKey) {
    const apiKey = open(p.openrouterApiKey)
    // Keys saved before encryption existed get sealed the first time they're used.
    if (!isSealed(p.openrouterApiKey)) await prisma.coachProfile.update({ where: { id: p.id }, data: { openrouterApiKey: seal(apiKey) } })
    return { mode: "byok", apiKey, model: p.preferredModel }
  }
  const s = await programFundingSummary(userId)
  if (s.mode === "allowance") return { mode: "allowance", left: s.left }
  if (s.mode === "balance") return { mode: "balance", balanceCents: s.balanceCents }
  throw new AiFundingError(
    `You've used this month's AI programs. Add AI balance in Settings, Plan & billing (a program is usually under $1), or use your own OpenRouter key.`,
  )
}

/**
 * Books a finished model call. Our-key calls go to AiUsage; balance calls also
 * take the marked-up price off the balance. BYOK calls cost us nothing and aren't
 * recorded, so they never count toward the monthly safety cap.
 */
export async function settleAiCall(
  userId: string,
  funding: Pick<Funding, "mode">,
  call: { kind: "generate" | "assist"; model: string; costUsd: number; tokensIn?: number; tokensOut?: number; clientId?: string | null },
) {
  if (funding.mode === "byok") return 0
  const paid = funding.mode === "balance"
  await recordUsage({ ...call, coachId: userId, kind: paid ? (`${call.kind}_paid` as const) : call.kind })
  if (!paid) return 0
  const cents = chargeCents(call.costUsd)
  await prisma.coachProfile.update({ where: { userId }, data: { aiBalanceCents: { decrement: cents } } })
  return cents
}
