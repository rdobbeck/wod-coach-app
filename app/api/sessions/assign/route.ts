import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withAlert } from "@/lib/alert"

/**
 * The coach's hand on the counter.
 *   { eventId, clientIds, alias? }   this session is for these clients; alias = also match this word in future titles
 *   { eventId, ignore: true }        this is not a client session, stop asking
 *   { clientId, markPaid: true }     clear the payment flag on this client's recent sessions
 * Assignments made here are never overwritten by the next calendar read.
 */
async function handlePOST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const coachId = session.user.id
  const body = (await req.json().catch(() => ({}))) as {
    eventId?: string
    clientIds?: string[]
    alias?: string
    ignore?: boolean
    clientId?: string
    markPaid?: boolean
  }

  const mine = async (ids: string[]) => {
    const n = await prisma.clientCoach.count({ where: { coachId, clientId: { in: ids } } })
    return n === new Set(ids).size
  }

  if (body.markPaid && body.clientId) {
    if (!(await mine([body.clientId]))) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const r = await prisma.sessionEvent.updateMany({
      where: { coachId, clientIds: { has: body.clientId }, needsPayment: true, startsAt: { gte: new Date(Date.now() - 14 * 86_400_000) } },
      data: { paidOverride: true },
    })
    return NextResponse.json({ ok: true, cleared: r.count })
  }

  if (!body.eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 })
  const ev = await prisma.sessionEvent.findFirst({ where: { id: body.eventId, coachId } })
  if (!ev) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (body.ignore) {
    await prisma.sessionEvent.update({ where: { id: ev.id }, data: { clientIds: [], matchedBy: "ignored" } })
    return NextResponse.json({ ok: true })
  }

  const ids = Array.from(new Set(body.clientIds ?? []))
  if (!ids.length || !(await mine(ids))) return NextResponse.json({ error: "Pick one of your clients" }, { status: 400 })
  await prisma.sessionEvent.update({ where: { id: ev.id }, data: { clientIds: ids, matchedBy: "manual" } })

  const alias = body.alias?.trim().toLowerCase()
  if (alias && alias.length >= 2 && alias.length <= 60) {
    await prisma.clientAlias.upsert({
      where: { coachId_alias: { coachId, alias } },
      create: { coachId, clientId: ids[0], alias },
      update: { clientId: ids[0] },
    })
  }
  return NextResponse.json({ ok: true })
}
export const POST = withAlert("sessions/assign", handlePOST)
