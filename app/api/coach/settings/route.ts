import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withAlert } from "@/lib/alert"
import { bookingFor } from "@/lib/booking"

/** Coach defaults for new clients and rest timers. */
async function handlePATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await req.json()) as { defaultUnits?: string; defaultRestSeconds?: number; defaultCanMoveWorkouts?: boolean; bio?: string; bookingUrl?: string }

  const rest = Number(body.defaultRestSeconds)
  const data = {
    ...(body.defaultUnits === "lb" || body.defaultUnits === "kg" ? { defaultUnits: body.defaultUnits } : {}),
    ...(Number.isFinite(rest) && rest >= 15 && rest <= 600 ? { defaultRestSeconds: Math.round(rest) } : {}),
    ...(typeof body.defaultCanMoveWorkouts === "boolean" ? { defaultCanMoveWorkouts: body.defaultCanMoveWorkouts } : {}),
    ...(typeof body.bio === "string" ? { bio: body.bio.trim() || null } : {}),
    // Stored normalised, so the client app can trust what it embeds. An empty
    // string clears it and hides booking from clients.
    ...(typeof body.bookingUrl === "string"
      ? { bookingUrl: body.bookingUrl.trim() ? (bookingFor(body.bookingUrl)?.url ?? null) : null }
      : {}),
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  await prisma.coachProfile.upsert({ where: { userId: session.user.id }, update: data, create: { userId: session.user.id, ...data } })
  return NextResponse.json({ ok: true })
}

export const PATCH = withAlert("coach/settings", handlePATCH)
