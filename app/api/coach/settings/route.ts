import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withAlert } from "@/lib/alert"
import { bookingFor, normalizePhone } from "@/lib/booking"
import { checkSlug } from "@/lib/coach-slug-db"
import { removeAvatar, saveAvatar } from "@/lib/avatars"

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
    venmoHandle?: string
    payInstructions?: string
    /** Places the coach trains clients, in order; replaces the whole list. [] clears it. */
    sessionLocations?: { label?: string; url?: string }[]
    /** Where clients text to set up a session; "" clears it. */
    textNumber?: string
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
    const prev = (await prisma.user.findUnique({ where: { id: session.user.id }, select: { image: true } }))?.image
    let image: string | null = null
    if (body.photo) {
      try {
        image = await saveAvatar(session.user.id, body.photo, prev)
      } catch (e) {
        console.error("[settings] photo upload failed:", e)
        return NextResponse.json({ error: "Couldn't save the photo. Try again." }, { status: 502 })
      }
    } else {
      await removeAvatar(prev)
    }
    await prisma.user.update({ where: { id: session.user.id }, data: { image } })
  }

  // A Venmo handle goes into a link, so it is held to what Venmo allows.
  let venmoHandle: string | null | undefined
  if (typeof body.venmoHandle === "string") {
    const h = body.venmoHandle.trim().replace(/^@/, "")
    if (h && !/^[A-Za-z0-9_-]{2,40}$/.test(h)) return NextResponse.json({ error: "A Venmo handle is letters, numbers, dashes and underscores." }, { status: 400 })
    venmoHandle = h || null
  }

  // Places to train: each needs a name and an embeddable scheduling link.
  let locations: { label: string; url: string }[] | undefined
  if (Array.isArray(body.sessionLocations)) {
    if (body.sessionLocations.length > 8) return NextResponse.json({ error: "Up to 8 places." }, { status: 400 })
    locations = []
    for (const row of body.sessionLocations) {
      const label = typeof row?.label === "string" ? row.label.trim().slice(0, 40) : ""
      const url = typeof row?.url === "string" ? bookingFor(row.url)?.url : undefined
      if (!label && !row?.url?.trim()) continue // an empty row is just unused
      if (!label) return NextResponse.json({ error: "Give every place a name." }, { status: 400 })
      if (!url) return NextResponse.json({ error: `"${label}" needs a secure (https) scheduling link.` }, { status: 400 })
      locations.push({ label, url })
    }
  }

  let textNumber: string | null | undefined
  if (typeof body.textNumber === "string") {
    if (body.textNumber.trim()) {
      textNumber = normalizePhone(body.textNumber)
      if (!textNumber) return NextResponse.json({ error: "That doesn't look like a phone number." }, { status: 400 })
    } else {
      textNumber = null
    }
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
    ...(venmoHandle !== undefined ? { venmoHandle } : {}),
    ...(textNumber !== undefined ? { textNumber } : {}),
    ...(typeof body.payInstructions === "string" ? { payInstructions: body.payInstructions.trim().slice(0, 600) || null } : {}),
    ...(typeof body.brandName === "string" ? { brandName: body.brandName.trim().slice(0, 60) || null } : {}),
    ...(specialties ? { specialties } : {}),
    ...(certifications ? { certifications } : {}),
    ...(body.yearsExp !== undefined && (years === null || (Number.isInteger(years) && years >= 0 && years <= 60)) ? { yearsExp: years } : {}),
  }
  if (locations) {
    // The list is replaced whole, so the order on the page is the order saved.
    await prisma.$transaction([
      prisma.sessionLocation.deleteMany({ where: { coachId: session.user.id } }),
      prisma.sessionLocation.createMany({ data: locations.map((l, i) => ({ coachId: session.user.id, ...l, sortOrder: i })) }),
    ])
  }

  if (!Object.keys(data).length) {
    if (typeof body.photo === "string" || locations) return NextResponse.json({ ok: true })
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  await prisma.coachProfile.upsert({ where: { userId: session.user.id }, update: data, create: { userId: session.user.id, ...data } })
  return NextResponse.json({ ok: true })
}

export const PATCH = withAlert("coach/settings", handlePATCH)
