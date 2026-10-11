import { AiCapError, assertUnderCap } from "@/lib/ai/spend"
import { ASSIST_MIN_CENTS } from "@/lib/ai-billing"
import { getCoachPlan } from "@/lib/plans"
import { prisma } from "@/lib/prisma"

/**
 * Who pays for a small AI call (Ask AI, the library builder). Included on
 * plans with the assistant up to the monthly cap; otherwise, or past the cap,
 * it comes out of the coach's AI balance. Nothing left: a 402 with a reason.
 */
export async function decideAssistFunding(coachId: string): Promise<{ mode: "allowance" | "balance" } | { deny: { error: string; code: string } }> {
  const [{ plan }, profile] = await Promise.all([
    getCoachPlan(coachId),
    prisma.coachProfile.findUnique({ where: { userId: coachId }, select: { aiBalanceCents: true } }),
  ])
  const balance = profile?.aiBalanceCents ?? 0
  if (plan.assistant) {
    try {
      await assertUnderCap(coachId)
      return { mode: "allowance" }
    } catch (e) {
      if (!(e instanceof AiCapError)) throw e
      if (balance < ASSIST_MIN_CENTS) return { deny: { error: e.message, code: e.code } }
    }
  }
  if (balance < ASSIST_MIN_CENTS) {
    return { deny: { error: "The AI assistant comes with Pro and Studio. Or add AI balance in Settings, Plan & billing and pay a few cents a message.", code: "AI_FUNDS" } }
  }
  return { mode: "balance" }
}
