import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withAlert } from "@/lib/alert"
import { stripe, stripeConfigured } from "@/lib/pay/stripe"
import { checkoutParams } from "@/lib/pay/checkout"

/** A signed-in client starts a card payment for one product. Returns the Stripe page to send them to. */
async function handlePOST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "CLIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { productId } = (await req.json().catch(() => ({}))) as { productId?: string }
  if (!productId) return NextResponse.json({ error: "productId is required" }, { status: 400 })
  if (!stripeConfigured()) return NextResponse.json({ error: "Card payments are not set up yet." }, { status: 503 })

  const link = await prisma.clientCoach.findFirst({
    where: { clientId: session.user.id, status: "ACTIVE" },
    select: { coachId: true, client: { select: { email: true } } },
  })
  if (!link) return NextResponse.json({ error: "You are not linked to a coach yet." }, { status: 404 })
  const product = await prisma.product.findFirst({ where: { id: productId, coachId: link.coachId, active: true } })
  if (!product) return NextResponse.json({ error: "That is not available." }, { status: 404 })

  const origin = process.env.NEXTAUTH_URL ?? new URL(req.url).origin
  const checkout = await stripe().checkout.sessions.create(
    checkoutParams({ product, coachId: link.coachId, clientId: session.user.id, email: link.client.email, origin, successPath: "/client/pay", cancelPath: "/client/pay" })
  )
  return NextResponse.json({ url: checkout.url })
}
export const POST = withAlert("pay/checkout", handlePOST)
