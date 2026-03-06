import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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
    const { aiProvider, openrouterApiKey, preferredModel } = body

    // Update settings
    await prisma.coachProfile.update({
      where: { id: coach.id },
      data: {
        ...(aiProvider && { aiProvider }),
        ...(openrouterApiKey !== undefined && { openrouterApiKey }),
        ...(preferredModel && { preferredModel }),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("AI settings update error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to update settings" },
      { status: 500 }
    )
  }
}
