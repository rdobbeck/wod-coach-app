import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { coachOf } from "@/lib/coach-access"
import { withAlert } from "@/lib/alert"
import { fromDayKey } from "@/lib/training"

const DAY = 86_400_000

/**
 * Put a copy of a program on a client, starting on a chosen day.
 * Body: { clientId, startDate: "YYYY-MM-DD" }.
 *
 * The copy lands as a draft, so the coach reviews it before the client sees
 * anything. Sessions keep their spacing from the original plan: where a client
 * had moved a session, it goes back to the day the coach planned it. Nothing
 * of the original client's comes along (no logs, notes, or comments).
 */
async function handlePOST(req: Request, { params }: { params: { programId: string } }) {
  const source = await prisma.program.findUnique({
    where: { id: params.programId },
    include: {
      workouts: {
        orderBy: [{ scheduledDate: "asc" }, { order: "asc" }],
        include: { exercises: { orderBy: { order: "asc" } } },
      },
    },
  })
  if (!source || !(await coachOf(source.clientId))) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { clientId, startDate } = (await req.json()) as { clientId?: string; startDate?: string }
  if (!clientId || !startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return NextResponse.json({ error: "clientId and startDate (YYYY-MM-DD) are required" }, { status: 400 })
  }
  const session = await coachOf(clientId)
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!source.workouts.length) return NextResponse.json({ error: "That program has no sessions to copy" }, { status: 400 })

  const start = fromDayKey(startDate)
  const shift = Math.round((start.getTime() - source.startDate.getTime()) / DAY) * DAY
  const planned = (w: (typeof source.workouts)[number]) => new Date((w.originalDate ?? w.scheduledDate).getTime() + shift)

  const copy = await prisma.$transaction(async (tx) => {
    const program = await tx.program.create({
      data: {
        name: source.name,
        description: source.description,
        goals: source.goals,
        coachId: session.user.id,
        clientId,
        startDate: start,
        endDate: source.endDate ? new Date(source.endDate.getTime() + shift) : null,
        isActive: true,
        isDraft: true,
        programType: "COPY",
      },
    })
    for (const w of source.workouts) {
      const day = planned(w)
      await tx.workout.create({
        data: {
          clientId,
          programId: program.id,
          name: w.name,
          description: w.description,
          coachNotes: w.coachNotes,
          warmup: w.warmup,
          cooldown: w.cooldown,
          scheduledDate: day,
          dayOfWeek: day.getUTCDay(),
          order: w.order,
          exercises: {
            create: w.exercises.map((e) => ({
              exerciseId: e.exerciseId,
              name: e.name,
              prescription: e.prescription,
              supersetGroup: e.supersetGroup,
              order: e.order,
              sets: e.sets,
              reps: e.reps,
              weight: e.weight,
              restSeconds: e.restSeconds,
              tempo: e.tempo,
              notes: e.notes,
            })),
          },
        },
      })
    }
    return program
  }, { timeout: 60_000 })

  return NextResponse.json({ ok: true, programId: copy.id, workouts: source.workouts.length })
}

export const POST = withAlert("programs/copy", handlePOST)
