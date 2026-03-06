import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { generateProgram } from "@/lib/ai/openrouter"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || session.user.role !== "COACH") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get coach profile
    const coach = await prisma.coachProfile.findUnique({
      where: { userId: session.user.id },
    })

    if (!coach) {
      return NextResponse.json({ error: "Coach profile not found" }, { status: 404 })
    }

    const body = await req.json()
    const { clientGoals, trainingDays, equipment, experience, programLength, injuries, clientId } = body

    // Validate input
    if (!clientGoals || !trainingDays || !equipment || !experience || !programLength) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Generate program using AI
    const result = await generateProgram({
      coachId: coach.id,
      clientGoals,
      trainingDays,
      equipment,
      experience,
      programLength,
      injuries,
      clientId,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("AI program generation error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to generate program" },
      { status: 500 }
    )
  }
}
