import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ownerEmails } from "@/lib/plans"
import { billingConfigured, platformStripe, stripeTestMode } from "@/lib/stripe-platform"
import { syncCustomer } from "@/lib/billing"

export const maxDuration = 60

const WEBHOOK_PATH = "/api/webhooks/stripe-platform"
const NEEDED = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"]

/**
 * Owner only. Reports how the Stripe account's webhooks are set up (no secrets:
 * Stripe only reveals a signing secret when an endpoint is created) and pulls
 * every coach's billing state straight from Stripe, fixing anything a missed
 * webhook left behind.
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  const email = session?.user.email?.toLowerCase()
  if (!session || session.user.role !== "COACH" || !email || !ownerEmails().includes(email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!billingConfigured()) return NextResponse.json({ error: "No Stripe key is set on the server." }, { status: 409 })

  const stripe = platformStripe()
  const endpoints = (await stripe.webhookEndpoints.list({ limit: 20 })).data.map((w) => ({
    url: w.url,
    status: w.status,
    pointsAtApp: w.url.endsWith(WEBHOOK_PATH),
    missingEvents: w.enabled_events.includes("*") ? [] : NEEDED.filter((e) => !w.enabled_events.includes(e)),
  }))

  const rows = await prisma.subscription.findMany({
    where: { stripeCustomerId: { not: null } },
    select: { stripeCustomerId: true, coach: { select: { user: { select: { email: true } } } } },
  })
  const coaches = []
  for (const r of rows) {
    const who = (r.coach.user.email ?? "?").replace(/^(.{3}).*@/, "$1…@")
    try {
      coaches.push({ who, ...(await syncCustomer(r.stripeCustomerId!)) })
    } catch (e) {
      coaches.push({ who, error: (e as Error).message })
    }
  }
  return NextResponse.json({ mode: stripeTestMode() ? "test" : "live", webhookSecretSet: !!process.env.STRIPE_PLATFORM_WEBHOOK_SECRET, endpoints, coaches })
}
