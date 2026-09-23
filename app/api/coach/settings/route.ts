import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withAlert } from "@/lib/alert"
import { checkSlug } from "@/lib/coach-slug-db"

/** Coach defaults for new clients and rest timers. */
async function handlePATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await req.json()) as { defaultUnits?: string; defaultRestSeconds?: number; defaultCanMoveWorkouts?: boolean; bio?: string; slug?: string; brandName?: string }

  let slug: string | undefined
  if (typeof body.slug === "string") {
    const r = await checkSlug(body.slug, session.user.id)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    slug = r.slug
  }

  const rest = Number(body.defaultRestSeconds)
  const data = {
    ...(body.defaultUnits === "lb" || body.defaultUnits === "kg" ? { defaultUnits: body.defaultUnits } : {}),
    ...(Number.isFinite(rest) && rest >= 15 && rest <= 600 ? { defaultRestSeconds: Math.round(rest) } : {}),
    ...(typeof body.defaultCanMoveWorkouts === "boolean" ? { defaultCanMoveWorkouts: body.defaultCanMoveWorkouts } : {}),
    ...(typeof body.bio === "string" ? { bio: body.bio.trim() || null } : {}),
    ...(slug ? { slug } : {}),
    ...(typeof body.brandName === "string" ? { brandName: body.brandName.trim().slice(0, 60) || null } : {}),
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  await prisma.coachProfile.upsert({ where: { userId: session.user.id }, update: data, create: { userId: session.user.id, ...data } })
  return NextResponse.json({ ok: true })
}

export const PATCH = withAlert("coach/settings", handlePATCH)
