import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Body = { endpoint?: string; keys?: { p256dh?: string; auth?: string } }

/** Register this browser for notifications (idempotent: one row per endpoint). */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const { endpoint, keys } = (await req.json()) as Body
  if (!endpoint || !keys?.p256dh || !keys.auth) {
    return NextResponse.json({ error: "Incomplete subscription" }, { status: 400 })
  }
  const userAgent = req.headers.get("user-agent")?.slice(0, 255) ?? null
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: session.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    update: { userId: session.user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent },
  })
  return NextResponse.json({ ok: true })
}

/** Turn notifications off for this browser. */
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const { endpoint } = (await req.json()) as Body
  if (endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: session.user.id } })
  return NextResponse.json({ ok: true })
}
