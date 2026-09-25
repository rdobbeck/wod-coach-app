import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withAlert } from "@/lib/alert"
import { parseDollars } from "@/lib/pay/money"

/** Create or change something clients can buy. Prices are never deleted, only switched off, so old payments still make sense. */
async function handlePOST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const coachId = session.user.id
  const b = (await req.json().catch(() => ({}))) as { id?: string; name?: string; description?: string; price?: string | number; sessions?: number; active?: boolean }

  if (b.id && typeof b.active === "boolean" && b.name === undefined) {
    const r = await prisma.product.updateMany({ where: { id: b.id, coachId }, data: { active: b.active } })
    return NextResponse.json({ ok: r.count === 1 }, { status: r.count === 1 ? 200 : 404 })
  }

  const name = b.name?.trim().slice(0, 80)
  const priceCents = parseDollars(b.price ?? "")
  const sessions = Number.isInteger(b.sessions) && b.sessions! >= 1 && b.sessions! <= 100 ? b.sessions! : 1
  if (!name) return NextResponse.json({ error: "Give it a name." }, { status: 400 })
  if (priceCents === null) return NextResponse.json({ error: "Enter a price between $1 and $5,000." }, { status: 400 })
  const data = { name, description: b.description?.trim().slice(0, 300) || null, priceCents, sessions }

  if (b.id) {
    const r = await prisma.product.updateMany({ where: { id: b.id, coachId }, data })
    return NextResponse.json({ ok: r.count === 1 }, { status: r.count === 1 ? 200 : 404 })
  }
  const last = await prisma.product.aggregate({ where: { coachId }, _max: { sortOrder: true } })
  const p = await prisma.product.create({ data: { coachId, ...data, sortOrder: (last._max.sortOrder ?? 0) + 1 }, select: { id: true } })
  return NextResponse.json({ ok: true, id: p.id })
}
export const POST = withAlert("products", handlePOST)
