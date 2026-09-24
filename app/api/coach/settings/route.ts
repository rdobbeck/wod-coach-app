import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withAlert } from "@/lib/alert"
import { bookingFor } from "@/lib/booking"
import { checkSlug } from "@/lib/coach-slug-db"

/** Coach defaults for new clients and rest timers. */
async function handlePATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await req.json()) as {
    defaultUnits?: string
    defaultRestSeconds?: number
    defaultCanMoveWorkouts?: boolean
    bio?: string
    bookingUrl?: string
    monthlyCallCredits?: number
    slug?: string
    brandName?: string
    specialties?: string[]
    certifications?: string[]
    yearsExp?: number | null
    /** Square JPEG data URL, already shrunk in the browser; "" removes it. */
    photo?: string
  }

  let slug: string | undefined
  if (typeof body.slug === "string") {
    const r = await checkSlug(body.slug, session.user.id)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    slug = r.slug
  }

  // Public coach page details. Lists are trimmed, deduped and capped so the
  // page layout can trust them.
  const list = (v: unknown, max: number, len: number) =>
    Array.isArray(v)
      ? Array.from(new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, len)).filter(Boolean))).slice(0, max)
      : undefined
  const specialties = list(body.specialties, 6, 40)
  const certifications = list(body.certifications, 6, 60)
  const years = body.yearsExp === null ? null : Number(body.yearsExp)

  if (typeof body.photo === "string") {
    const ok = body.photo === "" || (/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(body.photo) && body.photo.length <= 200_000)
    if (!ok) return NextResponse.json({ error: "Photo must be a small JPEG" }, { status: 400 })
    await prisma.user.update({ where: { id: session.user.id }, data: { image: body.photo || null } })
  }

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
    ...(Number.isInteger(body.monthlyCallCredits) && body.monthlyCallCredits! >= 0 && body.monthlyCallCredits! <= 30
      ? { monthlyCallCredits: body.monthlyCallCredits }
      : {}),
    ...(slug ? { slug } : {}),
    ...(typeof body.brandName === "string" ? { brandName: body.brandName.trim().slice(0, 60) || null } : {}),
    ...(specialties ? { specialties } : {}),
    ...(certifications ? { certifications } : {}),
    ...(body.yearsExp !== undefined && (years === null || (Number.isInteger(years) && years >= 0 && years <= 60)) ? { yearsExp: years } : {}),
  }
  if (!Object.keys(data).length) {
    if (typeof body.photo === "string") return NextResponse.json({ ok: true })
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  await prisma.coachProfile.upsert({ where: { userId: session.user.id }, update: data, create: { userId: session.user.id, ...data } })
  return NextResponse.json({ ok: true })
}

export const PATCH = withAlert("coach/settings", handlePATCH)
