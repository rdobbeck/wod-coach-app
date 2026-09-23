import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withAlert } from "@/lib/alert"
import { PROTOCOLS } from "@/lib/fasting"

/** A client's own preferences: theme, units, and their fasting window. */
async function handlePATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "CLIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await req.json()) as {
    theme?: string
    units?: string
    fastingProtocol?: string
    eatingWindowStart?: string
    eatingWindowEnd?: string
  }
  const clock = (v?: string) => (v && /^\d{2}:\d{2}$/.test(v) ? v : undefined)
  const protocol = body.fastingProtocol && PROTOCOLS[body.fastingProtocol] ? body.fastingProtocol : undefined
  const data = {
    ...(body.theme === "dark" || body.theme === "light" ? { theme: body.theme } : {}),
    ...(body.units === "lb" || body.units === "kg" ? { units: body.units } : {}),
    ...(protocol ? { fastingProtocol: protocol, fastingTargetHours: PROTOCOLS[protocol].fastHours } : {}),
    ...(clock(body.eatingWindowStart) ? { eatingWindowStart: body.eatingWindowStart } : {}),
    ...(clock(body.eatingWindowEnd) ? { eatingWindowEnd: body.eatingWindowEnd } : {}),
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
