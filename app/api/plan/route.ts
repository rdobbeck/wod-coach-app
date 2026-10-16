import { NextResponse } from "next/server"
import { withAlert } from "@/lib/alert"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { clientVisible } from "@/lib/training"
import { DEFAULT_MINUTES, isTime, isTz } from "@/lib/calendar-invite"

type Item = { id?: unknown; time?: unknown; minutes?: unknown }

/**
 * "Schedule my session": the client says when they'll train.
 * Body: { tz: "America/Chicago", items: [{ id, time: "HH:MM" | null, minutes? }] }.
 * One item for a single session, several for Schedule my week; time null clears it.
 * Clients only, their own published, not-yet-completed workouts.
 */
async function handlePOST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { tz?: unknown; items?: Item[] }
  if (!isTz(body.tz)) return NextResponse.json({ error: "Unknown timezone" }, { status: 400 })
  const tz = body.tz
  const items = Array.isArray(body.items) ? body.items : []
  if (!items.length || items.length > 31) return NextResponse.json({ error: "Nothing to schedule" }, { status: 400 })
  for (const it of items) {
    if (typeof it.id !== "string") return NextResponse.json({ error: "Bad session id" }, { status: 400 })
    if (it.time !== null && !isTime(it.time)) return NextResponse.json({ error: "Pick a time" }, { status: 400 })
    if (it.minutes !== undefined && (typeof it.minutes !== "number" || !Number.isInteger(it.minutes) || it.minutes < 5 || it.minutes > 300)) {
      return NextResponse.json({ error: "Length must be 5 to 300 minutes" }, { status: 400 })
    }
  }

  const ids = items.map((i) => i.id as string)
  const owned = await prisma.workout.findMany({
    where: { id: { in: ids }, clientId: session.user.id, isCompleted: false, ...clientVisible },
    select: { id: true },
  })
  if (owned.length !== new Set(ids).size) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const now = new Date()
  await prisma.$transaction(
    items.map((it) =>
      prisma.workout.update({
        where: { id: it.id as string },
        data:
          it.time === null
            ? { plannedTime: null, plannedMinutes: null, plannedTz: null, plannedAt: null }
            : { plannedTime: it.time as string, plannedMinutes: (it.minutes as number | undefined) ?? DEFAULT_MINUTES, plannedTz: tz, plannedAt: now },
      }),
    ),
  )
  return NextResponse.json({ ok: true, saved: items.length })
}

export const POST = withAlert("plan", handlePOST)
