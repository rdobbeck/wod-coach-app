import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || session.user.role !== "COACH") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { name, email, goals, equipment, injuries } = body
    const coachId = session.user.id // never trust a coachId from the request body

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return NextResponse.json({ error: "Email already in use" }, { status: 400 })
    }

    // No password: the client sets their own from the sign-in link the coach
    // sends them (POST /api/clients/[clientId]/invite). A shared default here
    // would let anyone who knows a client's email sign in as them.

    // Create user, client profile, and coach-client relationship in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          name,
          email,
          role: "CLIENT",
        },
      })

      // Create client profile, seeded from the coach's defaults
      const defaults = await tx.coachProfile.findUnique({ where: { userId: coachId }, select: { defaultUnits: true, defaultCanMoveWorkouts: true } })
      await tx.clientProfile.create({
        data: {
          userId: user.id,
          goals: goals || [],
          equipment: equipment || [],
          injuries: injuries || null,
          units: defaults?.defaultUnits ?? "lb",
          canMoveWorkouts: defaults?.defaultCanMoveWorkouts ?? true,
        },
      })

      // Create coach-client relationship
      await tx.clientCoach.create({
        data: {
          clientId: user.id,
          coachId: coachId,
          status: "ACTIVE",
        },
      })

      return user
    })

    return NextResponse.json({
      success: true,
      client: { id: result.id, name: result.name, email: result.email },
    })
  } catch (error: any) {
    console.error("Create client error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create client" },
      { status: 500 }
    )
  }
}
