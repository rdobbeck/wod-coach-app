import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAlert } from "@/lib/alert"
import { stripe, stripeConfigured } from "@/lib/pay/stripe"
import { checkoutParams } from "@/lib/pay/checkout"

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/

/**
 * Someone who is not signed in buys something from the coach's public page.
 * Body: { slug, productId, email }. The price is the product's, the coach is the
 * page's, and nothing about the buyer is trusted beyond the email Stripe will
 * also collect. Card only: Venmo and bank need a person the coach knows.
 */
async function handlePOST(req: Request) {
  const { slug, productId, email } = (await req.json().catch(() => ({}))) as { slug?: string; productId?: string; email?: string }
  const address = email?.trim().toLowerCase()
  if (!address || !EMAIL.test(address)) return NextResponse.json({ error: "Enter a valid email so we can send your receipt." }, { status: 400 })
  if (!slug || !productId) return NextResponse.json({ error: "slug and productId are required" }, { status: 400 })

  const coach = await prisma.coachProfile.findUnique({ where: { slug }, select: { userId: true } })
  if (!coach) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const product = await prisma.product.findFirst({ where: { id: productId, coachId: coach.userId, active: true } })
  if (!product) return NextResponse.json({ error: "That is not available." }, { status: 404 })
  if (!stripeConfigured()) return NextResponse.json({ error: "Card payments are not set up yet." }, { status: 503 })

  const origin = process.env.NEXTAUTH_URL ?? new URL(req.url).origin
  const checkout = await stripe().checkout.sessions.create(
    checkoutParams({ product, coachId: coach.userId, email: address, guest: true, origin, successPath: `/pay/${slug}/thanks`, cancelPath: `/pay/${slug}` })
  )
  return NextResponse.json({ url: checkout.url })
}
export const POST = withAlert("pay/guest", handlePOST)
