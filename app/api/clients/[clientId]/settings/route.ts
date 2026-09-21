import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/** Coach-only client settings. Body: { canMoveWorkouts?: boolean, units?: "lb" | "kg" } */
export async function PATCH(req: Request, { params }: { params: { clientId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const link = await prisma.clientCoach.findUnique({
    where: { clientId_coachId: { clientId: params.clientId, coachId: session.user.id } },
  })
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = (await req.json()) as { canMoveWorkouts?: boolean; units?: string }
  const data = {
    ...(typeof body.canMoveWorkouts === "boolean" ? { canMoveWorkouts: body.canMoveWorkouts } : {}),
    ...(body.units === "lb" || body.units === "kg" ? { units: body.units } : {}),
  }
  await prisma.clientProfile.upsert({
    where: { userId: params.clientId },
    update: data,
    create: { userId: params.clientId, ...data },
  })
  return NextResponse.json({ ok: true })
}
