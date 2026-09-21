import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const INVITE_DAYS = 7

/**
 * Coach creates a one-time invite link for their client (no email service needed:
 * the coach texts it). Opening it lets the client set a password and sign in.
 * Creating a new link invalidates the previous ones.
 */
export async function POST(req: Request, { params }: { params: { clientId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const link = await prisma.clientCoach.findUnique({
    where: { clientId_coachId: { clientId: params.clientId, coachId: session.user.id } },
  })
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const identifier = `invite:${params.clientId}`
  const token = randomBytes(24).toString("base64url")
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier } }),
    prisma.verificationToken.create({
      data: { identifier, token, expires: new Date(Date.now() + INVITE_DAYS * 86_400_000) },
    }),
  ])
  const origin = process.env.NEXTAUTH_URL ?? new URL(req.url).origin
  return NextResponse.json({ url: `${origin}/auth/invite/${token}`, expiresInDays: INVITE_DAYS })
}
