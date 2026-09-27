import { NextResponse } from "next/server"
import { headers } from "next/headers"
import Stripe from "stripe"
import { prisma } from "@/lib/prisma"
import { notifyUser } from "@/lib/notify"
import { fulfillStripeSession } from "@/lib/pay/ledger"
import { dollars } from "@/lib/pay/money"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-02-24.acacia"
})

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ""

export async function POST(req: Request) {
  try {
    const body = await req.text()
    const signature = headers().get("stripe-signature")

    if (!signature) {
      return NextResponse.json({ error: "No signature" }, { status: 400 })
    }

    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message)
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
    }

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session

        // A client paying for a session or package. Recorded once, whether or
        // not the page they land on afterwards got there first.
        if (session.metadata?.kind === "session_purchase") {
          await fulfillStripeSession(session)
        }

        break
      }

      // A payment that finished later than the checkout (some bank methods).
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.metadata?.kind === "session_purchase") await fulfillStripeSession(session)
        break
      }

      case "charge.refunded": {
        await handleRefund(event.data.object as Stripe.Charge)
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error("Webhook error:", error)
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    )
  }
}

async function handleRefund(charge: Stripe.Charge) {
  const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id
  if (!intent) return
  const payment = await prisma.payment.findFirst({ where: { stripePaymentIntent: intent } })
  if (!payment) return
  const full = charge.refunded && charge.amount_refunded >= charge.amount
  if (full && payment.status !== "REFUNDED") {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } })
  }
  await notifyUser(payment.coachId, {
    title: full ? "Payment refunded" : "Partial refund",
    body: `${dollars(charge.amount_refunded)} of ${dollars(payment.amountCents)} refunded: ${payment.description}.`,
    url: "/coach/payments",
    tag: `refund-${payment.id}`,
  })
}
