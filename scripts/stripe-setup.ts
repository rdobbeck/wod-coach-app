#!/usr/bin/env tsx
/**
 * Creates (or updates) the WOD.COACH products and prices in whichever Stripe
 * account STRIPE_PLATFORM_SECRET_KEY points at: the sandbox while testing,
 * the live account after activation. Idempotent: prices are found by
 * lookup_key, and a changed amount creates a new price and moves the key.
 *
 *   npx tsx --env-file=.env.local scripts/stripe-setup.ts
 */
import { platformStripe, stripeTestMode } from "../lib/stripe-platform"
import { PAID_PLANS, PLANS, SETUP_CENTS, SETUP_LOOKUP_KEY, lookupKey } from "../lib/plans"
import type Stripe from "stripe"

async function product(stripe: Stripe, id: string, name: string, description: string) {
  try {
    return await stripe.products.update(id, { name, description })
  } catch {
    return stripe.products.create({ id, name, description })
  }
}

async function price(stripe: Stripe, productId: string, key: string, cents: number, recurring?: Stripe.PriceCreateParams.Recurring) {
  const { data } = await stripe.prices.list({ lookup_keys: [key], limit: 1 })
  const same = data[0] && data[0].unit_amount === cents && data[0].product === productId && data[0].recurring?.interval === recurring?.interval
  if (same) return data[0]
  const created = await stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: cents,
    lookup_key: key,
    transfer_lookup_key: true,
    ...(recurring ? { recurring } : {}),
  })
  if (data[0]) await stripe.prices.update(data[0].id, { active: false })
  return created
}

async function main() {
  const stripe = platformStripe()
  console.log(`[stripe-setup] ${stripeTestMode() ? "SANDBOX (test mode)" : "LIVE"} account`)

  for (const id of PAID_PLANS) {
    const plan = PLANS[id]
    const p = await product(
      stripe,
      `wodcoach_plan_${id.toLowerCase()}`,
      `WOD.COACH ${plan.name}`,
      `Up to ${plan.clients} clients, ${plan.aiPrograms} AI-built programs a month${plan.assistant ? ", AI assistant" : ""}. Every feature included.`
    )
    const m = await price(stripe, p.id, lookupKey(id, "month"), plan.monthlyCents, { interval: "month" })
    const y = await price(stripe, p.id, lookupKey(id, "year"), plan.yearlyCents, { interval: "year" })
    console.log(`  ${plan.name}: ${m.id} ($${plan.monthlyCents / 100}/mo), ${y.id} ($${plan.yearlyCents / 100}/yr)`)
  }

  const setup = await product(stripe, "wodcoach_setup", "WOD.COACH done-for-you setup", "We move your clients over, set up your page, and build your first program with you.")
  const s = await price(stripe, setup.id, SETUP_LOOKUP_KEY, SETUP_CENTS)
  console.log(`  Setup: ${s.id} ($${SETUP_CENTS / 100} one-time)`)

  await product(stripe, "wodcoach_ai_balance", "WOD.COACH AI balance", "Pay-as-you-go balance for AI-built programs and the AI assistant.")
  console.log("  AI balance product ready (top-ups are priced at checkout)")

  // Customer portal: coaches change plan, update their card, see invoices, cancel.
  const monthly = await stripe.prices.list({ lookup_keys: PAID_PLANS.flatMap((id) => [lookupKey(id, "month"), lookupKey(id, "year")]), limit: 10 })
  const byProduct = new Map<string, string[]>()
  for (const pr of monthly.data) byProduct.set(pr.product as string, [...(byProduct.get(pr.product as string) ?? []), pr.id])
  const portalConfig: Stripe.BillingPortal.ConfigurationCreateParams = {
    business_profile: { headline: "Manage your WOD.COACH plan" },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["email", "address"] },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products: Array.from(byProduct.entries()).map(([product, prices]) => ({ product, prices })),
      },
    },
  }
  const existing = (await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 })).data[0]
  if (existing) await stripe.billingPortal.configurations.update(existing.id, portalConfig as Stripe.BillingPortal.ConfigurationUpdateParams)
  else await stripe.billingPortal.configurations.create(portalConfig)
  console.log("  Customer portal configured")
}

main().catch((e) => {
  console.error("[stripe-setup] failed:", e.message)
  process.exit(1)
})
