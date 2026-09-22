import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { coachOf } from "@/lib/coach-access"

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

/** Publish a draft (client sees it) or unpublish (back to draft, hidden). Body: { publish: boolean } */
export async function PATCH(req: Request, { params }: { params: { programId: string } }) {
  const program = await prisma.program.findUnique({ where: { id: params.programId } })
  if (!program || !(await coachOf(program.clientId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const { publish } = (await req.json()) as { publish?: boolean }
  if (typeof publish === "boolean") await prisma.program.update({ where: { id: program.id }, data: { isDraft: !publish } })
  return NextResponse.json({ ok: true })
}
