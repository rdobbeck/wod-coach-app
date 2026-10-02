import { NextResponse } from "next/server"
import { withAlert } from "@/lib/alert"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"

/** Redeem an invite: { token, password } -> sets the client's password, burns the token. */
async function handlePOST(req: Request) {
  const { token, password } = (await req.json()) as { token?: string; password?: string }
  if (!token || !password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
  }
  const invite = await prisma.verificationToken.findUnique({ where: { token } })
  if (!invite || !invite.identifier.startsWith("invite:") || invite.expires < new Date()) {
    return NextResponse.json({ error: "This invite link has expired. Ask your coach for a new one." }, { status: 400 })
  }
  const userId = invite.identifier.slice("invite:".length)
  const user = await prisma.user.update({
    where: { id: userId },
    data: { hashedPassword: await bcrypt.hash(password, 12), emailVerified: new Date() },
  })
  await prisma.verificationToken.deleteMany({ where: { identifier: invite.identifier } })
  // An invite is the coach asking them back: a past client becomes current again. Paused stays paused.
  await prisma.clientCoach.updateMany({ where: { clientId: userId, status: "INACTIVE" }, data: { status: "ACTIVE", endDate: null } })
  return NextResponse.json({ email: user.email })
}

export const POST = withAlert("auth/invite", handlePOST)
