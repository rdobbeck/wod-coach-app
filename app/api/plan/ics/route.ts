import { NextResponse } from "next/server"
import { withAlert } from "@/lib/alert"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { clientVisible, dayKey } from "@/lib/training"
import { buildIcs, eventCopy, isTz } from "@/lib/calendar-invite"
import { verifyPlanIcs } from "@/lib/plan-link"

export const dynamic = "force-dynamic"

/**
 * The client's planned sessions as one .ics: GET /api/plan/ics?ids=a,b,c&u=&exp=&sig=.
 * Opening it on an iPhone shows the "Add to Calendar" sheet; Outlook and
 * desktop calendars import it. Only sessions that have a time are included.
 *
 * iOS downloads the file in a system browser without the app's cookies, so the
 * signed link (from POST /api/plan/link) is what proves whose sessions these
 * are. A signed-in session still works for plain ?ids= links.
 */
async function handleGET(req: Request) {
  const url = new URL(req.url)
  const signed = url.searchParams.has("sig") ? verifyPlanIcs(url.searchParams) : null
  if (url.searchParams.has("sig") && !signed) return NextResponse.json({ error: "This calendar link has expired. Open the session and try again." }, { status: 403 })
  const userId = signed?.userId ?? (await getServerSession(authOptions))?.user.id
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ids = (signed?.ids ?? (url.searchParams.get("ids") ?? "").split(",").filter(Boolean)).slice(0, 31)
  if (!ids.length) return NextResponse.json({ error: "Nothing to add" }, { status: 400 })

  const workouts = await prisma.workout.findMany({
    where: { id: { in: ids }, clientId: userId, plannedTime: { not: null }, ...clientVisible },
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
