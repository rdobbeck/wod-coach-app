import { NextResponse } from "next/server"
import { withAlert } from "@/lib/alert"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { clientVisible, dayKey } from "@/lib/training"
import { buildIcs, eventCopy, isTz } from "@/lib/calendar-invite"

export const dynamic = "force-dynamic"

/**
 * The client's planned sessions as one .ics: GET /api/plan/ics?ids=a,b,c.
 * Opening it on an iPhone shows the "Add to Calendar" sheet; Outlook and
 * desktop calendars import it. Only sessions that have a time are included.
 */
async function handleGET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 31)
  if (!ids.length) return NextResponse.json({ error: "Nothing to add" }, { status: 400 })

  const workouts = await prisma.workout.findMany({
    where: { id: { in: ids }, clientId: session.user.id, plannedTime: { not: null }, ...clientVisible },
    orderBy: [{ scheduledDate: "asc" }, { plannedTime: "asc" }],
    include: { exercises: { orderBy: { order: "asc" }, select: { name: true, exercise: { select: { name: true } } } } },
  })
  const events = workouts
    .filter((w) => w.plannedTime && isTz(w.plannedTz))
    .map((w) => ({
      id: w.id,
      day: dayKey(w.scheduledDate),
      time: w.plannedTime!,
      minutes: w.plannedMinutes ?? 60,
      tz: w.plannedTz!,
      url: `${url.origin}/client/workouts/${w.id}`,
      ...eventCopy(w.name, w.exercises.map((e) => e.name ?? e.exercise?.name ?? "Exercise")),
    }))
  if (!events.length) return NextResponse.json({ error: "Pick a time first" }, { status: 400 })

  return new NextResponse(buildIcs(events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${events.length === 1 ? "session" : "my-week"}.ics"`,
      "Cache-Control": "no-store",
    },
  })
}

export const GET = withAlert("plan/ics", handleGET)
