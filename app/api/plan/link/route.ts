import { NextResponse } from "next/server"
import { withAlert } from "@/lib/alert"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { planIcsPath } from "@/lib/plan-link"

/** A signed .ics link for the signed-in client's sessions. Body: { ids: string[] }. */
async function handlePOST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { ids } = (await req.json().catch(() => ({}))) as { ids?: unknown }
  if (!Array.isArray(ids) || !ids.length || ids.length > 31 || !ids.every((i) => typeof i === "string" && /^[\w-]{1,64}$/.test(i))) {
    return NextResponse.json({ error: "Nothing to add" }, { status: 400 })
  }
  return NextResponse.json({ url: planIcsPath(session.user.id, ids) })
}

export const POST = withAlert("plan/link", handlePOST)
