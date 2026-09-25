import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { customerFor } from "@/lib/billing"
import { PAID_PLANS, SETUP_LOOKUP_KEY, getCoachPlan, lookupKey, type PlanId } from "@/lib/plans"
import { appOrigin, platformStripe, priceId } from "@/lib/stripe-platform"

/**
 * Starts a Stripe Checkout for a coach:
 *   { kind: "plan", plan: "COACH" | "PRO" | "STUDIO", interval: "month" | "year", setup?: boolean }
 *   { kind: "setup" }                     done-for-you setup on its own
 *   { kind: "ai", amountCents: 1000..10000 }  AI balance top-up
 * A yearly plan includes the setup at no charge.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { kind?: string; plan?: string; interval?: string; setup?: boolean; amountCents?: number }

  try {
    const stripe = platformStripe()
    const { customerId, coachProfileId } = await customerFor(session.user.id)
    const origin = appOrigin(req)
    const back = `${origin}/coach/settings/billing`
    const metadata = { coachProfileId, userId: session.user.id, kind: body.kind ?? "" }

    if (body.kind === "plan") {
      const plan = body.plan as PlanId
      const interval = body.interval === "year" ? "year" : "month"
      if (!PAID_PLANS.includes(plan)) return NextResponse.json({ error: "Pick Coach, Pro or Studio" }, { status: 400 })
      const current = await getCoachPlan(session.user.id)
      if (current.source === "paid") {
        return NextResponse.json({ error: "You're already subscribed. Change plans from Manage billing." }, { status: 400 })
      }
      const addSetup = !!body.setup && interval === "month"
      const s = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [
          { price: await priceId(lookupKey(plan, interval)), quantity: 1 },
          ...(addSetup ? [{ price: await priceId(SETUP_LOOKUP_KEY), quantity: 1 }] : []),
        ],
        allow_promotion_codes: true,
        subscription_data: { metadata },
        metadata: { ...metadata, plan, interval, setup: String(addSetup || interval === "year") },
        success_url: `${back}?done=plan`,
        cancel_url: back,
      })
      return NextResponse.json({ url: s.url })
    }

    if (body.kind === "setup") {
      const s = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        line_items: [{ price: await priceId(SETUP_LOOKUP_KEY), quantity: 1 }],
        metadata,
        success_url: `${back}?done=setup`,
        cancel_url: back,
      })
      return NextResponse.json({ url: s.url })
    }

    if (body.kind === "ai") {
      const cents = Math.round(Number(body.amountCents))
      if (!Number.isFinite(cents) || cents < 1000 || cents > 10000) {
        return NextResponse.json({ error: "Top up between $10 and $100" }, { status: 400 })
      }
      const s = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        line_items: [{ price_data: { currency: "usd", product: "wodcoach_ai_balance", unit_amount: cents }, quantity: 1 }],
        // Save the card so auto top-up can charge it later, if they turn it on.
        payment_intent_data: { setup_future_usage: "off_session", metadata: { ...metadata, amountCents: String(cents) } },
        metadata: { ...metadata, amountCents: String(cents) },
        success_url: `${back}?done=ai`,
        cancel_url: back,
      })
      return NextResponse.json({ url: s.url })
    }

    return NextResponse.json({ error: "Unknown checkout" }, { status: 400 })
  } catch (e) {
    console.error("[billing] checkout failed:", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
