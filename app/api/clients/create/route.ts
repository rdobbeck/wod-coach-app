import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || session.user.role !== "COACH") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { coachId, name, email, password, goals, equipment, injuries } = body

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return NextResponse.json({ error: "Email already in use" }, { status: 400 })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create user, client profile, and coach-client relationship in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          name,
          email,
          hashedPassword,
          role: "CLIENT",
        },
      })

      // Create client profile
      await tx.clientProfile.create({
        data: {
          userId: user.id,
          goals: goals || [],
          equipment: equipment || [],
          injuries: injuries || null,
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
      client: result,
    })
  } catch (error: any) {
    console.error("Create client error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create client" },
      { status: 500 }
    )
  }
}
