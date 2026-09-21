import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { coachOf } from "@/lib/coach-access"

/** Coach deletes a program and its workouts (used by "Discard & regenerate"). */
export async function DELETE(_req: Request, { params }: { params: { programId: string } }) {
  const program = await prisma.program.findUnique({ where: { id: params.programId } })
  if (!program || !(await coachOf(program.clientId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const logged = await prisma.workoutLog.count({ where: { workout: { programId: program.id } } })
  if (logged) {
    return NextResponse.json({ error: "The client has already logged workouts in this program" }, { status: 400 })
  }
  await prisma.$transaction([
    prisma.workout.deleteMany({ where: { programId: program.id } }),
    prisma.program.delete({ where: { id: program.id } }),
  ])
  return NextResponse.json({ ok: true })
}

/** Coach publishes a draft program so the client sees it. Body: { publish: true } */
export async function PATCH(req: Request, { params }: { params: { programId: string } }) {
  const program = await prisma.program.findUnique({ where: { id: params.programId } })
  if (!program || !(await coachOf(program.clientId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const { publish } = (await req.json()) as { publish?: boolean }
  if (publish) await prisma.program.update({ where: { id: program.id }, data: { isDraft: false } })
  return NextResponse.json({ ok: true })
}
