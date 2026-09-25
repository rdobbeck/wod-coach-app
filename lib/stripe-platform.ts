import Stripe from "stripe"

/**
 * The WOD.COACH platform's Stripe account (coach plans, AI balance, Connect).
 * Separate from STRIPE_SECRET_KEY, which is Ryan's personal account used by the
 * older credit-pack and VBT code. A test key (sk_test_) means the sandbox;
 * billing pages show a "Test mode" badge when that's the case.
 */
let client: Stripe | null = null

export function platformStripe(): Stripe {
  const key = process.env.STRIPE_PLATFORM_SECRET_KEY
  if (!key) throw new Error("Billing isn't set up yet (STRIPE_PLATFORM_SECRET_KEY is missing)")
  client ??= new Stripe(key, { apiVersion: "2025-02-24.acacia" })
  return client
}

export const billingConfigured = () => !!process.env.STRIPE_PLATFORM_SECRET_KEY
export const stripeTestMode = () => (process.env.STRIPE_PLATFORM_SECRET_KEY ?? "").startsWith("sk_test_")

const priceCache = new Map<string, string>()

/** Price id for a lookup key created by scripts/stripe-setup.ts. */
export async function priceId(lookupKey: string): Promise<string> {
  const cached = priceCache.get(lookupKey)
  if (cached) return cached
  const { data } = await platformStripe().prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
  if (!data[0]) throw new Error(`No Stripe price with lookup key ${lookupKey}; run scripts/stripe-setup.ts`)
  priceCache.set(lookupKey, data[0].id)
  return data[0].id
}

/** The app's public origin, for Stripe redirect URLs. */
export const appOrigin = (req: Request) => process.env.NEXTAUTH_URL ?? new URL(req.url).origin
