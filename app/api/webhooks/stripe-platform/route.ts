import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { prisma } from "@/lib/prisma"
import { syncSubscription } from "@/lib/billing"
import { platformStripe, stripeTestMode } from "@/lib/stripe-platform"
import { alertRyan } from "@/lib/alert"

/**
 * Webhook for the WOD.COACH platform Stripe account. Every handler is safe to
 * run twice (Stripe retries): subscriptions are synced from Stripe's current
 * state, and AI top-ups are recorded once per payment intent.
 *
 * Events: checkout.session.completed, customer.subscription.created/updated/deleted
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_PLATFORM_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })

  const stripe = platformStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret)
  } catch (e) {
    return NextResponse.json({ error: `Bad signature: ${(e as Error).message}` }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object)
        break

      case "checkout.session.completed": {
        const s = event.data.object
        const test = stripeTestMode() ? "[TEST] " : ""
        const coachProfileId = s.metadata?.coachProfileId
        if (!coachProfileId || s.payment_status === "unpaid") break

        if (s.mode === "subscription" && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id)
          await syncSubscription(sub)
          if (s.metadata?.setup === "true") {
            await prisma.subscription.update({ where: { coachId: coachProfileId }, data: { setupPaid: true } })
          }
          await alertRyan(`${test}New WOD.COACH subscriber`, `${s.customer_details?.email ?? "A coach"} started ${s.metadata?.plan} (${s.metadata?.interval}ly)${s.metadata?.setup === "true" ? " with done-for-you setup" : ""}.`)
        }
        if (s.metadata?.kind === "setup") {
          await prisma.subscription.update({ where: { coachId: coachProfileId }, data: { setupPaid: true } })
          await alertRyan(`${test}Done-for-you setup booked`, `${s.customer_details?.email ?? "A coach"} paid for setup. Reach out to schedule it.`)
        }
        if (s.metadata?.kind === "ai") {
          const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id
          const cents = Number(s.metadata.amountCents ?? s.amount_total ?? 0)
          if (pi && cents > 0) {
            const seen = await prisma.aICreditPurchase.findFirst({ where: { stripePaymentIntentId: pi }, select: { id: true } })
            if (!seen) {
              await prisma.$transaction([
                prisma.aICreditPurchase.create({
                  data: { coachId: coachProfileId, creditsAmount: 0, pricePerCredit: 0, totalAmount: cents / 100, stripePaymentIntentId: pi },
                }),
                prisma.coachProfile.update({ where: { id: coachProfileId }, data: { aiBalanceCents: { increment: cents } } }),
              ])
            }
          }
        }
        break
      }
    }
  } catch (e) {
    console.error(`[stripe-platform] ${event.type} failed:`, e)
    return NextResponse.json({ error: "Handler failed" }, { status: 500 })
  }
  return NextResponse.json({ received: true })
}
