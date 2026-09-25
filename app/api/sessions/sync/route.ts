import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withAlert } from "@/lib/alert"
import { NotConfigured, syncCalendar } from "@/lib/sessions/sync"

export const maxDuration = 60

/** Coach presses "Refresh": read the calendar now and say what came of it. */
async function handlePOST() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    return NextResponse.json({ ok: true, report: await syncCalendar(session.user.id) })
  } catch (e) {
    if (e instanceof NotConfigured) return NextResponse.json({ ok: false, error: e.message, code: "NOT_CONFIGURED" }, { status: 409 })
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 })
  }
}
export const POST = withAlert("sessions/sync", handlePOST)
