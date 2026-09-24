import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withAlert } from "@/lib/alert"
import { undoChangeSet } from "@/lib/ai/apply"

/** Undo a batch of applied AI edits. Body: { changeSetId }. */
async function handlePOST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { changeSetId } = (await req.json().catch(() => ({}))) as { changeSetId?: string }
  if (!changeSetId) return NextResponse.json({ error: "changeSetId is required" }, { status: 400 })
  const r = await undoChangeSet(session.user.id, changeSetId)
  return NextResponse.json(r.ok ? r : { error: r.error }, { status: r.ok ? 200 : 404 })
}

export const POST = withAlert("ai/assist/undo", handlePOST)
