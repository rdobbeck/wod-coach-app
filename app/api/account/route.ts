import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import bcrypt from "bcryptjs"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withAlert } from "@/lib/alert"
import { Prisma } from "@prisma/client"
import { normalizeUsername, usernameError } from "@/lib/username"

/**
 * Own account, for coaches and clients alike.
 * Body: { name?, username?, currentPassword? + newPassword? }.
 * An empty username removes it. Changing a password needs the current one,
 * unless the account has none yet (invited clients who signed in through a link).
 */
async function handlePATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { name, username, currentPassword, newPassword } = (await req.json()) as {
    name?: string
    username?: string
    currentPassword?: string
    newPassword?: string
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const data: { name?: string; username?: string | null; hashedPassword?: string } = {}
  if (typeof name === "string") {
    if (!name.trim()) return NextResponse.json({ error: "Name can't be empty" }, { status: 400 })
    data.name = name.trim()
  }
  if (typeof username === "string") {
    const u = normalizeUsername(username)
    if (!u) data.username = null
    else {
      const err = usernameError(u)
      if (err) return NextResponse.json({ error: err }, { status: 400 })
      data.username = u
    }
  }
  if (newPassword) {
    if (newPassword.length < 8) return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 })
    if (user.hashedPassword && !(await bcrypt.compare(currentPassword ?? "", user.hashedPassword))) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
    }
    data.hashedPassword = await bcrypt.hash(newPassword, 12)
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  try {
    await prisma.user.update({ where: { id: user.id }, data })
  } catch (e) {
    // Two people claiming the same username at once: the unique index decides.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "That username is taken" }, { status: 409 })
    }
    throw e
  }
  return NextResponse.json({ ok: true, username: data.username })
}

export const PATCH = withAlert("account", handlePATCH)
