import { NextResponse } from "next/server"
import { headers } from "next/headers"
import Stripe from "stripe"
import { prisma } from "@/lib/prisma"

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

        // Check if this is an AI credits purchase
        if (session.metadata?.type === "ai_credits_purchase") {
          await handleCreditPurchase(session)
        }

        // Check if this is a VBT subscription
        if (session.metadata?.type === "vbt_subscription") {
          // Handle VBT subscription (existing logic)
        }

        break
      }

      case "invoice.payment_succeeded": {
        // Handle recurring VBT payments if needed
        break
      }

      case "invoice.payment_failed": {
        // Handle failed payments if needed
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

async function handleCreditPurchase(session: Stripe.Checkout.Session) {
  const coachId = session.metadata?.coachId
  const creditsAmount = parseInt(session.metadata?.creditsAmount || "0")
  const pricePerCredit = parseFloat(session.metadata?.pricePerCredit || "0")

  if (!coachId || !creditsAmount) {
    console.error("Missing metadata in checkout session:", session.id)
    return
  }

  try {
    // Add credits and record purchase in a transaction
    await prisma.$transaction([
      // Add credits to coach's balance
      prisma.coachProfile.update({
        where: { id: coachId },
        data: {
          aiCredits: {
            increment: creditsAmount,
          },
        },
      }),

      // Record the purchase
      prisma.aICreditPurchase.create({
        data: {
          coachId,
          creditsAmount,
          pricePerCredit,
          totalAmount: creditsAmount * pricePerCredit,
          stripePaymentIntentId: session.payment_intent as string,
        },
      }),
    ])

    console.log(`Added ${creditsAmount} credits to coach ${coachId}`)
  } catch (error) {
    console.error("Error adding credits:", error)
    throw error
  }
}
