import { NextResponse } from "next/server"
import { headers } from "next/headers"
import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { notifyUser } from "@/lib/notify"

/**
 * Cal.com booking webhook.
 *
 * Cal signs the raw body with HMAC SHA256 under the secret shown when the
 * webhook is created, and sends it as x-cal-signature-256. Without a configured
 * secret this route refuses everything rather than trusting the caller.
 *
 * A booking here is what spends a client's monthly free call. The credit is
 * counted from these rows, so a cancellation returns it automatically.
 */
type CalPayload = {
  triggerEvent?: string
  payload?: {
    uid?: string
    title?: string
    startTime?: string
    endTime?: string
    organizer?: { email?: string }
    attendees?: { email?: string; name?: string }[]
  }
}

const ok = (body: Record<string, unknown>) => NextResponse.json(body)

function verify(raw: string, signature: string | null) {
  const secret = process.env.CAL_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  const raw = await req.text()
  if (!verify(raw, headers().get("x-cal-signature-256"))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 })
  }

  let event: CalPayload
  try {
    event = JSON.parse(raw) as CalPayload
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 })
  }

  const trigger = event.triggerEvent
  const p = event.payload
  if (!p?.uid) return ok({ ignored: "no booking uid" })

  // Cancellations and rejections hand the credit back.
  if (trigger === "BOOKING_CANCELLED" || trigger === "BOOKING_REJECTED") {
    await prisma.callBooking.updateMany({ where: { externalId: p.uid }, data: { cancelled: true } })
    return ok({ cancelled: p.uid })
  }
  if (trigger !== "BOOKING_CREATED" && trigger !== "BOOKING_RESCHEDULED" && trigger !== "BOOKING_REQUESTED") {
    return ok({ ignored: trigger ?? "unknown" })
  }

  // Match the booking to one of our clients by the email they booked under.
  const emails = (p.attendees ?? []).map((a) => a.email?.toLowerCase()).filter(Boolean) as string[]
  if (!emails.length) return ok({ ignored: "no attendee email" })

  const client = await prisma.user.findFirst({
    where: { email: { in: emails, mode: "insensitive" }, role: "CLIENT" },
    select: { id: true, email: true, coaches: { where: { status: "ACTIVE" }, select: { coachId: true }, take: 1 } },
  })
  if (!client?.coaches.length) return ok({ ignored: "no matching client" })

  const startsAt = p.startTime ? new Date(p.startTime) : new Date()
  const coachId = client.coaches[0].coachId

  await prisma.callBooking.upsert({
    where: { externalId: p.uid },
    create: {
      externalId: p.uid,
      clientId: client.id,
      coachId,
      title: p.title ?? null,
      startsAt,
      endsAt: p.endTime ? new Date(p.endTime) : null,
      attendee: client.email,
      cancelled: false,
    },
    // A reschedule keeps the same credit, it just moves.
    update: {
      title: p.title ?? null,
      startsAt,
      endsAt: p.endTime ? new Date(p.endTime) : null,
      cancelled: false,
    },
  })

  await notifyUser(coachId, {
    title: "Call booked",
    body: `${client.email ?? "A client"} booked ${startsAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`,
    url: `/coach/clients/${client.id}`,
    tag: `call-${p.uid}`,
  })

  return ok({ booked: p.uid })
}
