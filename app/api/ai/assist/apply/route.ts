import { NextResponse } from "next/server"
import { coachOf } from "@/lib/coach-access"
import { withAlert } from "@/lib/alert"
import { applyChanges, type ChangeInput } from "@/lib/ai/apply"

/**
 * Apply the edits the coach ticked. Body: { clientId, request, changes: [...] }.
 * Each change is re-checked against the database before it is written.
 */
async function handlePOST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; request?: string; changes?: ChangeInput[] }
  if (!body.clientId || !Array.isArray(body.changes) || !body.changes.length) {
    return NextResponse.json({ error: "clientId and at least one change are required" }, { status: 400 })
  }
  const session = await coachOf(body.clientId)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const result = await applyChanges(session.user.id, body.clientId, body.request ?? "", body.changes)
  return NextResponse.json(result)
}

export const POST = withAlert("ai/assist/apply", handlePOST)
