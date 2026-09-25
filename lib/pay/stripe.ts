import Stripe from "stripe"

/** Stripe is optional: without a key the Pay screen simply does not offer a card. */
export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY

let client: Stripe | null = null
export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error("Card payments are not set up yet.")
  client ??= new Stripe(key, { apiVersion: "2025-02-24.acacia" })
  return client
}
