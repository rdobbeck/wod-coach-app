import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-02-24.acacia"
})

// Credit packages with bulk discounts
const CREDIT_PACKAGES = {
  5: { credits: 5, price: 1500, label: "5 Credits" }, // $15 ($3 each)
  10: { credits: 10, price: 2500, label: "10 Credits - Save $5" }, // $25 ($2.50 each)
  25: { credits: 25, price: 6000, label: "25 Credits - Save $15" }, // $60 ($2.40 each)
  50: { credits: 50, price: 10000, label: "50 Credits - Save $50" }, // $100 ($2 each)
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || session.user.role !== "COACH") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const coach = await prisma.coachProfile.findUnique({
      where: { userId: session.user.id },
    })

    if (!coach) {
      return NextResponse.json({ error: "Coach profile not found" }, { status: 404 })
    }

    const body = await req.json()
    const { packageKey } = body

    const creditPackage = CREDIT_PACKAGES[packageKey as keyof typeof CREDIT_PACKAGES]

    if (!creditPackage) {
      return NextResponse.json({ error: "Invalid credit package" }, { status: 400 })
    }

    // Create Stripe checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `AI Program Credits - ${creditPackage.label}`,
              description: `${creditPackage.credits} AI program generation credits for WOD Coach`,
            },
            unit_amount: creditPackage.price,
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXTAUTH_URL}/coach/settings/ai?success=true&credits=${creditPackage.credits}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/coach/settings/ai?cancelled=true`,
      client_reference_id: coach.id,
      metadata: {
        coachId: coach.id,
        userId: session.user.id,
        creditsAmount: creditPackage.credits.toString(),
        pricePerCredit: (creditPackage.price / creditPackage.credits / 100).toFixed(2),
        type: "ai_credits_purchase",
      },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error: any) {
    console.error("Stripe checkout error:", error)
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    )
  }
}
