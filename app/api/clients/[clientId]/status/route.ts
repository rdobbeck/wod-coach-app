import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { clientLimitProblem } from "@/lib/plans"

/**
 * Move a client between current (ACTIVE) and past (INACTIVE). Past clients keep
 * all their history and don't count toward the plan's client limit; moving one
 * back to current does.
 */
export async function PATCH(req: Request, { params }: { params: { clientId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { status } = (await req.json().catch(() => ({}))) as { status?: string }
  if (status !== "ACTIVE" && status !== "INACTIVE") return NextResponse.json({ error: "status must be ACTIVE or INACTIVE" }, { status: 400 })

  const link = await prisma.clientCoach.findUnique({
    where: { clientId_coachId: { clientId: params.clientId, coachId: session.user.id } },
    select: { id: true, status: true },
  })
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (link.status === status) return NextResponse.json({ ok: true })

  if (status === "ACTIVE") {
    const limit = await clientLimitProblem(session.user.id)
    if (limit) return NextResponse.json({ error: limit }, { status: 402 })
  }
  await prisma.clientCoach.update({ where: { id: link.id }, data: { status, endDate: status === "INACTIVE" ? new Date() : null } })
  return NextResponse.json({ ok: true })
}
