import { NextResponse } from "next/server"
import { reportServerError } from "@/lib/alert"
import { coachOf } from "@/lib/coach-access"
import { saveProgramToCalendar, type ProgramData } from "@/lib/save-program"
import { notifyUser } from "@/lib/notify"

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
    // This path publishes straight to the calendar, so the client hears about it now.
    await notifyUser(clientId, {
      title: "New program",
      body: `${programData.programName} is on your calendar.`,
      url: "/client",
      tag: `program-${saved.programId ?? clientId}`,
    })
    return NextResponse.json({ success: true, ...saved })
  } catch (error: any) {
    await reportServerError("programs/save", error)
    return NextResponse.json({ error: error.message || "Failed to save program" }, { status: 500 })
  }
}
