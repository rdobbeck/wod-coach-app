import { NextResponse } from "next/server"
import { aiAccess, denialResponse, isDenied } from "@/lib/ai/access"
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
  const access = await aiAccess(body.clientId)
  if (isDenied(access)) return denialResponse(access)
  const result = await applyChanges(access.coachId, body.clientId, body.request ?? "", body.changes, access.userId)
  return NextResponse.json({ ...result, viewer: access.viewer })
}

export const POST = withAlert("ai/assist/apply", handlePOST)
