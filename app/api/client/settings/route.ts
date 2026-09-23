import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withAlert } from "@/lib/alert"
import { PROTOCOLS } from "@/lib/fasting"
import { isTheme } from "@/lib/themes"

/** A client's own preferences: theme, units, and their fasting window. */
async function handlePATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "CLIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await req.json()) as {
    theme?: string
    units?: string
    fastingEnabled?: boolean
    fastingProtocol?: string
    eatingWindowStart?: string
    eatingWindowEnd?: string
    tourSeen?: boolean
  }
  const clock = (v?: string) => (v && /^\d{2}:\d{2}$/.test(v) ? v : undefined)

  // A client can switch the fasting timer off and back on, but only within
  // what their coach offered them.
  let fastingEnabled: boolean | undefined
  if (typeof body.fastingEnabled === "boolean") {
    const offered = await prisma.clientProfile.findUnique({
      where: { userId: session.user.id },
      select: { fastingOffered: true },
    })
    if (offered?.fastingOffered) fastingEnabled = body.fastingEnabled
  }
  const protocol = body.fastingProtocol && PROTOCOLS[body.fastingProtocol] ? body.fastingProtocol : undefined
  const data = {
    ...(isTheme(body.theme) ? { theme: body.theme } : {}),
    ...(body.units === "lb" || body.units === "kg" ? { units: body.units } : {}),
    ...(fastingEnabled === undefined ? {} : { fastingEnabled }),
    ...(protocol ? { fastingProtocol: protocol, fastingTargetHours: PROTOCOLS[protocol].fastHours } : {}),
    ...(clock(body.eatingWindowStart) ? { eatingWindowStart: body.eatingWindowStart } : {}),
    ...(clock(body.eatingWindowEnd) ? { eatingWindowEnd: body.eatingWindowEnd } : {}),
    // false replays the walkthrough next time they open Today.
    ...(typeof body.tourSeen === "boolean" ? { tourSeenAt: body.tourSeen ? new Date() : null } : {}),
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  await prisma.clientProfile.upsert({
    where: { userId: session.user.id },
    update: data,
    create: { userId: session.user.id, ...data },
  })
  return NextResponse.json({ ok: true })
}

export const PATCH = withAlert("client/settings", handlePATCH)
