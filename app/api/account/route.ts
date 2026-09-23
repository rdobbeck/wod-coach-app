import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import bcrypt from "bcryptjs"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withAlert } from "@/lib/alert"

/**
 * Own account, for coaches and clients alike.
 * Body: { name?, currentPassword? + newPassword? }.
 * Changing a password needs the current one, unless the account has none yet
 * (invited clients who signed in through a link).
 */
async function handlePATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { name, currentPassword, newPassword } = (await req.json()) as {
    name?: string
    currentPassword?: string
    newPassword?: string
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const data: { name?: string; hashedPassword?: string } = {}
  if (typeof name === "string") {
    if (!name.trim()) return NextResponse.json({ error: "Name can't be empty" }, { status: 400 })
    data.name = name.trim()
  }
  if (newPassword) {
    if (newPassword.length < 8) return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 })
    if (user.hashedPassword && !(await bcrypt.compare(currentPassword ?? "", user.hashedPassword))) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
    }
    data.hashedPassword = await bcrypt.hash(newPassword, 12)
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  await prisma.user.update({ where: { id: user.id }, data })
  return NextResponse.json({ ok: true })
}

export const PATCH = withAlert("account", handlePATCH)
