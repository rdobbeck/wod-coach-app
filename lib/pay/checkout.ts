import type Stripe from "stripe"
import { MAX_CENTS, MIN_CENTS } from "./money"

export type ProductLike = { id: string; name: string; description: string | null; priceCents: number; sessions: number }

/**
 * The Stripe Checkout request for one product. The amount comes from the
 * product row on the server, never from the browser. The metadata is what
 * ties a payment back to the client and the coach when Stripe tells us it was paid.
 */
export function checkoutParams(o: {
  product: ProductLike
  coachId: string
  clientId?: string | null
  email?: string | null
  /** Someone who may not have an account yet: the payment creates their client record. */
  guest?: boolean
  origin: string
  successPath: string // where to send them after paying; gets the session id appended
  cancelPath: string
}): Stripe.Checkout.SessionCreateParams {
  const { product: p } = o
  if (p.priceCents < MIN_CENTS || p.priceCents > MAX_CENTS) throw new Error("That price is outside the allowed range.")
  const metadata: Record<string, string> = {
    kind: "session_purchase",
    coachId: o.coachId,
    productId: p.id,
    description: p.name.slice(0, 200),
    ...(o.clientId ? { clientId: o.clientId } : {}),
    ...(o.guest ? { guest: "1" } : {}),
  }
  const join = (path: string) => `${o.origin}${path}${path.includes("?") ? "&" : "?"}`
  return {
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: p.priceCents,
          product_data: { name: p.name, ...(p.description ? { description: p.description.slice(0, 500) } : {}) },
        },
      },
    ],
    metadata,
    payment_intent_data: { description: p.name, metadata },
    ...(o.clientId ? { client_reference_id: o.clientId } : {}),
    ...(o.email ? { customer_email: o.email } : {}),
    success_url: `${join(o.successPath)}paid=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${o.origin}${o.cancelPath}`,
  }
}
