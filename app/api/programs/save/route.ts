import { NextResponse } from "next/server"
import { coachOf } from "@/lib/coach-access"
import { saveProgramToCalendar, type ProgramData } from "@/lib/save-program"

export const maxDuration = 60

/** Save a generated program onto a client's calendar. Body: { programData, clientId, startDate }. */
export async function POST(req: Request) {
  try {
    const { programData, clientId, startDate } = (await req.json()) as { programData?: ProgramData; clientId?: string; startDate?: string }
    if (!programData || !clientId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    const session = await coachOf(clientId)
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const saved = await saveProgramToCalendar({ programData, clientId, coachUserId: session.user.id, startDate })
    return NextResponse.json({ success: true, ...saved })
  } catch (error: any) {
    console.error("Save program error:", error)
    return NextResponse.json({ error: error.message || "Failed to save program" }, { status: 500 })
  }
}
