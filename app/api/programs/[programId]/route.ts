import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { coachOf } from "@/lib/coach-access"
import { fromDayKey } from "@/lib/training"
import { notifyUser } from "@/lib/notify"

/**
 * Coach removes (unassigns) a program. Workouts the client hasn't logged are
 * deleted; logged ones stay on their calendar (detached from the program) so
 * history is never lost. Used by "Remove" and "Discard & regenerate".
 */
export async function DELETE(_req: Request, { params }: { params: { programId: string } }) {
  const program = await prisma.program.findUnique({ where: { id: params.programId } })
  if (!program || !(await coachOf(program.clientId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const [removed, kept] = await prisma.$transaction([
    prisma.workout.deleteMany({ where: { programId: program.id, logs: { none: {} } } }),
    prisma.workout.updateMany({ where: { programId: program.id }, data: { programId: null } }),
    prisma.program.delete({ where: { id: program.id } }),
  ])
  return NextResponse.json({ ok: true, removedWorkouts: removed.count, keptLoggedWorkouts: kept.count })
}

/**
 * Publish/unpublish a draft, or move the whole program to a new start date.
 * Body: { publish?: boolean, startDate?: "YYYY-MM-DD" }.
 * Moving shifts every workout the client hasn't completed by the same number of
 * days; completed sessions stay where they happened so history stays true.
 */
export async function PATCH(req: Request, { params }: { params: { programId: string } }) {
  const program = await prisma.program.findUnique({ where: { id: params.programId } })
  if (!program || !(await coachOf(program.clientId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const { publish, startDate } = (await req.json()) as { publish?: boolean; startDate?: string }
  if (typeof publish === "boolean") {
    await prisma.program.update({ where: { id: program.id }, data: { isDraft: !publish } })
    // Only a draft going live is news to the client.
    if (publish && program.isDraft) {
      await notifyUser(program.clientId, {
        title: "New program",
        body: `${program.name} is on your calendar.`,
        url: "/client",
        tag: `program-${program.id}`,
      })
    }
  }

  let moved = 0
  let kept = 0
  if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    const target = fromDayKey(startDate)
    const deltaDays = Math.round((target.getTime() - program.startDate.getTime()) / 86_400_000)
    if (deltaDays !== 0) {
      const workouts = await prisma.workout.findMany({
        where: { programId: program.id },
        select: { id: true, scheduledDate: true, isCompleted: true },
      })
      const shift = workouts.filter((w) => !w.isCompleted)
      kept = workouts.length - shift.length
      await prisma.$transaction([
        prisma.program.update({
          where: { id: program.id },
          data: {
            startDate: target,
            ...(program.endDate ? { endDate: new Date(program.endDate.getTime() + deltaDays * 86_400_000) } : {}),
          },
        }),
        ...shift.map((w) => {
          const date = new Date(w.scheduledDate.getTime() + deltaDays * 86_400_000)
          return prisma.workout.update({ where: { id: w.id }, data: { scheduledDate: date, dayOfWeek: date.getUTCDay() } })
        }),
      ])
      moved = shift.length
    }
  }

  return NextResponse.json({ ok: true, movedWorkouts: moved, keptCompleted: kept })
}
