import { prisma } from "@/lib/prisma"

/**
 * WOD.COACH coach plans (decided 2026-09-24). Every feature on every plan; the
 * plan sets how many clients a coach can have and how many AI-built programs
 * are included each month. AI beyond that comes from the coach's pay-as-you-go
 * balance, or their own OpenRouter key (lib/ai-billing.ts).
 *
 * Stripe prices are looked up by `lookup_key` (see scripts/stripe-setup.ts),
 * so the same code works against the sandbox and the live account.
 */
export type PlanId = "FREE" | "COACH" | "PRO" | "STUDIO"

export type Plan = {
  id: PlanId
  name: string
  clients: number
  aiPrograms: number
  assistant: boolean
  monthlyCents: number
  yearlyCents: number
}

export const PLANS: Record<PlanId, Plan> = {
  FREE: { id: "FREE", name: "Free", clients: 3, aiPrograms: 0, assistant: false, monthlyCents: 0, yearlyCents: 0 },
  COACH: { id: "COACH", name: "Coach", clients: 15, aiPrograms: 5, assistant: false, monthlyCents: 3900, yearlyCents: 39000 },
  PRO: { id: "PRO", name: "Pro", clients: 50, aiPrograms: 15, assistant: true, monthlyCents: 7900, yearlyCents: 79000 },
  STUDIO: { id: "STUDIO", name: "Studio", clients: 150, aiPrograms: 40, assistant: true, monthlyCents: 14900, yearlyCents: 149000 },
}
export const PAID_PLANS: PlanId[] = ["COACH", "PRO", "STUDIO"]

/** One-time done-for-you setup; free with a yearly plan. */
export const SETUP_CENTS = 19900
export const TRIAL_DAYS = 14
/** Starting AI balance for every coach, so they can try AI without a card. */
export const STARTER_AI_CENTS = 500

export const lookupKey = (plan: PlanId, interval: "month" | "year") => `wodcoach_${plan.toLowerCase()}_${interval}ly`
export const SETUP_LOOKUP_KEY = "wodcoach_setup"

// Owner accounts run on Studio at no charge.
const ownerEmails = () =>
  (process.env.OWNER_COACH_EMAILS ?? "dobbecktraining@gmail.com").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)

export type CoachPlan = {
  plan: Plan
  /** Why they have it: paying, on the free trial, comped, or the Free plan. */
  source: "paid" | "trial" | "owner" | "free"
  status: "active" | "trialing" | "past_due" | "canceled" | "free"
  trialEndsAt: Date | null
  trialDaysLeft: number | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  interval: "month" | "year" | null
  stripeCustomerId: string | null
}

const days = (ms: number) => Math.max(0, Math.ceil(ms / 86_400_000))

/**
 * The plan a coach is on right now. Paying beats everything; otherwise new
 * coaches get Pro for TRIAL_DAYS from when they signed up, then Free. Nobody
 * is locked out: dropping to Free keeps every client and all their data, and
 * only blocks adding clients past the Free limit.
 */
export async function getCoachPlan(userId: string, now = new Date()): Promise<CoachPlan> {
  const profile = await prisma.coachProfile.findUnique({
    where: { userId },
    select: { createdAt: true, user: { select: { email: true } }, subscription: true },
  })
  const sub = profile?.subscription
  const base = {
    trialEndsAt: null,
    trialDaysLeft: null,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    interval: (sub?.interval as "month" | "year" | null) ?? null,
    stripeCustomerId: sub?.stripeCustomerId ?? null,
  }

  if (sub?.stripeSubscriptionId && ["COACH", "PRO", "STUDIO"].includes(sub.tier) && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(sub.status)) {
    return {
      ...base,
      plan: PLANS[sub.tier as PlanId],
      source: "paid",
      status: sub.status === "PAST_DUE" ? "past_due" : sub.status === "TRIALING" ? "trialing" : "active",
    }
  }
  if (profile && ownerEmails().includes((profile.user.email ?? "").toLowerCase())) {
    return { ...base, plan: PLANS.STUDIO, source: "owner", status: "active" }
  }
  const trialEndsAt = profile ? new Date(profile.createdAt.getTime() + TRIAL_DAYS * 86_400_000) : null
  if (trialEndsAt && trialEndsAt > now) {
    return { ...base, plan: PLANS.PRO, source: "trial", status: "trialing", trialEndsAt, trialDaysLeft: days(trialEndsAt.getTime() - now.getTime()) }
  }
  return { ...base, plan: PLANS.FREE, source: "free", status: sub?.status === "CANCELLED" ? "canceled" : "free", trialEndsAt }
}

export const activeClientCount = (coachId: string) => prisma.clientCoach.count({ where: { coachId, status: "ACTIVE" } })

/** null when the coach can add another active client, otherwise the reason. */
export async function clientLimitProblem(userId: string): Promise<string | null> {
  const [{ plan }, count] = await Promise.all([getCoachPlan(userId), activeClientCount(userId)])
  if (count < plan.clients) return null
  return `Your ${plan.name} plan includes ${plan.clients} active clients. Upgrade in Settings, Plan & billing, or move a client to past clients.`
}

export const formatDollars = (cents: number) => {
  const d = cents % 100 ? 2 : 0
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`
}
