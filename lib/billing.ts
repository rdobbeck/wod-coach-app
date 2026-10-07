import type Stripe from "stripe"
import { prisma } from "@/lib/prisma"
import { platformStripe } from "@/lib/stripe-platform"
import type { PlanId } from "@/lib/plans"

/**
 * Coach billing state lives on the Subscription row (one per coach), kept in
 * sync from Stripe webhooks. Stripe is the source of truth; this is a copy the
 * app can read without calling Stripe on every page.
 */

/** The coach's Stripe customer, created on first checkout. */
export async function customerFor(userId: string): Promise<{ customerId: string; coachProfileId: string }> {
  const profile = await prisma.coachProfile.findUnique({
    where: { userId },
    select: { id: true, subscription: { select: { stripeCustomerId: true } }, user: { select: { email: true, name: true } } },
  })
  if (!profile) throw new Error("No coach profile")
  if (profile.subscription?.stripeCustomerId) return { customerId: profile.subscription.stripeCustomerId, coachProfileId: profile.id }

  const customer = await platformStripe().customers.create({
    email: profile.user.email ?? undefined,
    name: profile.user.name ?? undefined,
    metadata: { coachProfileId: profile.id, userId },
  })
  await prisma.subscription.upsert({
    where: { coachId: profile.id },
    update: { stripeCustomerId: customer.id },
    create: { coachId: profile.id, tier: "FREE", status: "ACTIVE", clientLimit: 3, stripeCustomerId: customer.id },
  })
  return { customerId: customer.id, coachProfileId: profile.id }
}

const tierFromLookupKey = (key: string | null | undefined): PlanId | null => {
  const m = key?.match(/^wodcoach_(coach|pro|studio)_(month|year)ly$/)
  return m ? (m[1].toUpperCase() as PlanId) : null
}

const STATUS: Record<string, "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED"> = {
  active: "ACTIVE",
  trialing: "TRIALING",
  past_due: "PAST_DUE",
  unpaid: "PAST_DUE",
  incomplete: "PAST_DUE",
  canceled: "CANCELLED",
  incomplete_expired: "CANCELLED",
  paused: "CANCELLED",
}

/** Copy a Stripe subscription onto the coach's Subscription row. */
export async function syncSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id
  const row = await prisma.subscription.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true } })
  if (!row) {
    console.warn(`[billing] subscription ${sub.id} for unknown customer ${customerId}`)
    return
  }
  const item = sub.items.data[0]
  const tier = tierFromLookupKey(item?.price.lookup_key)
  const ended = ["canceled", "incomplete_expired"].includes(sub.status)
  // Stripe moved the period end onto the item in newer API versions.
  const periodEnd = (item as unknown as { current_period_end?: number })?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end
  await prisma.subscription.update({
    where: { id: row.id },
    data: {
      tier: ended || !tier ? "FREE" : tier,
      status: STATUS[sub.status] ?? "ACTIVE",
      stripeSubscriptionId: ended ? null : sub.id,
      interval: item?.price.recurring?.interval ?? null,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      clientLimit: { COACH: 15, PRO: 50, STUDIO: 150, FREE: 3 }[ended || !tier ? "FREE" : tier],
      endDate: ended ? new Date() : null,
    },
  })
}

/** Adds a paid AI top-up to the coach's balance, once per payment intent. */
export async function creditAiTopUp(coachProfileId: string, paymentIntentId: string, cents: number) {
  if (!paymentIntentId || cents <= 0) return false
  const seen = await prisma.aICreditPurchase.findFirst({ where: { stripePaymentIntentId: paymentIntentId }, select: { id: true } })
  if (seen) return false
  await prisma.$transaction([
    prisma.aICreditPurchase.create({
      data: { coachId: coachProfileId, creditsAmount: 0, pricePerCredit: 0, totalAmount: cents / 100, stripePaymentIntentId: paymentIntentId },
    }),
    prisma.coachProfile.update({ where: { id: coachProfileId }, data: { aiBalanceCents: { increment: cents } } }),
  ])
  return true
}

/**
 * Reads a coach's state straight from Stripe and copies it over: their current
 * subscription, a paid done-for-you setup, and any AI top-up the app hasn't
 * credited. Webhooks normally do this; this is the backstop when one is late
 * or never arrives (run when the coach comes back from checkout, and by the
 * owner's repair). Safe to run any number of times.
 */
export async function syncCustomer(customerId: string) {
  const stripe = platformStripe()
  const row = await prisma.subscription.findFirst({ where: { stripeCustomerId: customerId }, select: { coachId: true } })
  if (!row) return { synced: false as const }

  const subs = (await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 })).data
  const live = subs.find((s) => ["active", "trialing", "past_due", "unpaid"].includes(s.status)) ?? subs[0]
  if (live) await syncSubscription(live)

  let setupPaid = false
  let aiCredited = 0
  for (const s of (await stripe.checkout.sessions.list({ customer: customerId, limit: 30 })).data) {
    if (s.status !== "complete" || s.payment_status !== "paid") continue
    if (s.metadata?.setup === "true" || s.metadata?.kind === "setup") setupPaid = true
    if (s.metadata?.kind === "ai") {
      const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id
      const cents = Number(s.metadata.amountCents ?? s.amount_total ?? 0)
      if (pi && (await creditAiTopUp(row.coachId, pi, cents))) aiCredited += cents
    }
  }
  if (setupPaid) await prisma.subscription.update({ where: { coachId: row.coachId }, data: { setupPaid: true } })
  return { synced: true as const, subscription: live ? `${live.status}` : "none", setupPaid, aiCredited }
}
