import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { USUAL_CATALOG } from "@/lib/pay/catalog"

/** One button for a coach with nothing set up: their usual three prices. Only ever runs on an empty list. */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const coachId = session.user.id
  if (await prisma.product.count({ where: { coachId } })) return NextResponse.json({ ok: true, created: 0 })
  await prisma.product.createMany({
    data: USUAL_CATALOG.map((c, n) => ({ coachId, name: c.name, description: c.description, priceCents: c.priceCents, sessions: c.sessions, sortOrder: n + 1 })),
  })
  return NextResponse.json({ ok: true, created: USUAL_CATALOG.length })
}
