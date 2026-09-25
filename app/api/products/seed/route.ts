import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/** One button for a coach with nothing set up: their usual three prices. Only ever runs on an empty list. */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const coachId = session.user.id
  if (await prisma.product.count({ where: { coachId } })) return NextResponse.json({ ok: true, created: 0 })
  await prisma.product.createMany({
    data: [
      { coachId, name: "Gym pod session", description: "60 minutes in person at the gym pod", priceCents: 12_000, sessions: 1, sortOrder: 1 },
      { coachId, name: "Off-site session", description: "60 minutes, I come to you", priceCents: 10_000, sessions: 1, sortOrder: 2 },
      { coachId, name: "10-session package", description: "Ten 60 minute sessions", priceCents: 100_000, sessions: 10, sortOrder: 3 },
    ],
  })
  return NextResponse.json({ ok: true, created: 3 })
}
