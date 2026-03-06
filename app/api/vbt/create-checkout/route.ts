import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-12-18.acacia"
})

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Create Stripe checkout session for weekly VBT subscription
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "VBT Tracking - WOD Coach",
              description: "Real-time velocity tracking, bar speed analysis, and data-driven training",
            },
            unit_amount: 499, // $4.99 in cents
            recurring: {
              interval: "week",
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXTAUTH_URL}/client/vbt?success=true`,
      cancel_url: `${process.env.NEXTAUTH_URL}/client/vbt?cancelled=true`,
      client_reference_id: session.user.id,
      metadata: {
        userId: session.user.id,
        type: "vbt_subscription"
      }
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    console.error("Stripe checkout error:", error)
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    )
  }
}
