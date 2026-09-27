import Stripe from "stripe"
import { prisma } from "@/lib/prisma"
import { ownerEmails } from "@/lib/plans"

/** Stripe is optional: without a key the Pay screen simply does not offer a card. */
export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY

/**
 * Whether this coach's clients can pay by card. STRIPE_SECRET_KEY is Ryan's own
 * (DTS) Stripe account, so card payments go to the owner coaches only; any other
 * coach's clients pay by Venmo or the coach's instructions until Stripe Connect
 * gives each coach their own account.
 */
export async function cardReadyFor(coachUserId: string) {
  if (!stripeConfigured()) return false
  const u = await prisma.user.findUnique({ where: { id: coachUserId }, select: { email: true } })
  return !!u?.email && ownerEmails().includes(u.email.toLowerCase())
}

let client: Stripe | null = null
export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error("Card payments are not set up yet.")
  client ??= new Stripe(key, { apiVersion: "2025-02-24.acacia" })
  return client
}
