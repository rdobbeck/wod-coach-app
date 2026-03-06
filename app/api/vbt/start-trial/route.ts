import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Check if user already has a VBT subscription
    const existing = await prisma.vBTSubscription.findUnique({
      where: { userId: session.user.id }
    })

    if (existing) {
      return NextResponse.json(
        { error: "VBT subscription already exists" },
        { status: 400 }
      )
    }

    // Create trial subscription (7 days)
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + 7)

    const subscription = await prisma.vBTSubscription.create({
      data: {
        userId: session.user.id,
        status: "TRIAL",
        trialEndsAt,
        weeklyPrice: 4.99
      }
    })

    return NextResponse.json({ success: true, subscription })
  } catch (error) {
    console.error("VBT trial start error:", error)
    return NextResponse.json(
      { error: "Failed to start trial" },
      { status: 500 }
    )
  }
}
