import { NextResponse } from "next/server"
import { aiAccess, denialResponse, isDenied } from "@/lib/ai/access"
import { withAlert } from "@/lib/alert"
import { applyChanges, type ChangeInput } from "@/lib/ai/apply"
import { notifyUser } from "@/lib/notify"
import { prisma } from "@/lib/prisma"

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
  // A client changed their own training: tell the coach, who can undo from the client's page.
  if (access.viewer === "client" && result.applied > 0) {
    const client = await prisma.user.findUnique({ where: { id: body.clientId }, select: { name: true } })
    const first = client?.name?.split(" ")[0] ?? "A client"
    const n = result.applied
    await notifyUser(access.coachId, {
      title: `${first} changed their training with AI`,
      body: `${n} ${n === 1 ? "edit" : "edits"}: ${(body.request ?? "").slice(0, 80)}`,
      url: `/coach/clients/${body.clientId}`,
      tag: `ai-change-${result.changeSetId}`,
    })
  }
  return NextResponse.json({ ...result, viewer: access.viewer })
}

export const POST = withAlert("ai/assist/apply", handlePOST)
