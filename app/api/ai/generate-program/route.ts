import { NextResponse } from "next/server"
import { AiFundingError } from "@/lib/ai-billing"
import { reportServerError } from "@/lib/alert"
import { generateProgram } from "@/lib/ai/openrouter"
import { prisma } from "@/lib/prisma"
import { coachOf } from "@/lib/coach-access"
import { saveProgramToCalendar } from "@/lib/save-program"

// Program generation with a large model can take a couple of minutes.
export const maxDuration = 300

/**
 * Generate a program and save it as a draft on the client's calendar, so a paid
 * generation is never lost if the coach closes the tab while it runs. The client
 * can't see it until the coach publishes it.
 * Body: { clientId, startDate, clientGoals, trainingDays, equipment, experience, programLength, injuries? }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { clientGoals, trainingDays, equipment, experience, programLength, injuries, clientId, startDate } = body

    if (!clientId || !clientGoals || !trainingDays || !equipment || !experience || !programLength) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    const session = await coachOf(clientId)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const coach = await prisma.coachProfile.findUnique({ where: { userId: session.user.id } })
    if (!coach) {
      return NextResponse.json({ error: "Coach profile not found" }, { status: 404 })
    }

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

    const saved = await saveProgramToCalendar({
      programData: result.program,
      clientId,
      coachUserId: session.user.id,
      startDate,
      draft: true, // coach reviews, then publishes it to the client
    })

    return NextResponse.json({ ...result, ...saved })
  } catch (error: any) {
    if (error instanceof AiFundingError) return NextResponse.json({ error: error.message, code: error.code }, { status: 402 })
    await reportServerError("ai/generate-program", error)
    return NextResponse.json(
      { error: error.message || "Failed to generate program" },
      { status: 500 }
    )
  }
}
