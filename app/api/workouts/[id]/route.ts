import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { coachOf } from "@/lib/coach-access"
import { fromDayKey } from "@/lib/training"

type ExerciseInput = {
  id?: string // existing WorkoutExercise id; omit for new rows
  exerciseId: string | null
  name: string
  prescription: string | null
  supersetGroup?: string | null
}
type WorkoutInput = {
  name: string
  date?: string // YYYY-MM-DD
  coachNotes?: string | null
  warmup?: string | null
  cooldown?: string | null
  exercises: ExerciseInput[]
}

async function load(id: string) {
  const w = await prisma.workout.findUnique({
    where: { id },
    include: { exercises: { include: { _count: { select: { exerciseLogs: true } } } } },
  })
  if (!w?.clientId) return { w: null, session: null }
  return { w, session: await coachOf(w.clientId) }
}

const txt = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null)

/** Coach saves a workout: fields + the full exercise list (rows reconciled by id). */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { w, session } = await load(params.id)
  if (!w || !session) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const body = (await req.json()) as WorkoutInput
  if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })

  const keep = new Set(body.exercises.filter((e) => e.id).map((e) => e.id!))
  const removedLogged = w.exercises.filter((e) => !keep.has(e.id) && e._count.exerciseLogs > 0)
  if (removedLogged.length) {
    return NextResponse.json(
      { error: `Can't remove ${removedLogged.map((e) => e.name).join(", ")}: the client already logged it` },
      { status: 400 }
    )
  }

  const date = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? fromDayKey(body.date) : null
  await prisma.$transaction(async (tx) => {
    await tx.workout.update({
      where: { id: w.id },
      data: {
        name: body.name.trim(),
        coachNotes: txt(body.coachNotes),
        warmup: txt(body.warmup),
        cooldown: txt(body.cooldown),
        ...(date && date.getTime() !== w.scheduledDate.getTime()
          ? { scheduledDate: date, dayOfWeek: date.getUTCDay(), originalDate: w.originalDate ?? w.scheduledDate, movedAt: new Date(), movedById: session.user.id }
          : {}),
      },
    })
    await tx.workoutExercise.deleteMany({ where: { workoutId: w.id, id: { notIn: Array.from(keep) } } })
    for (let i = 0; i < body.exercises.length; i++) {
      const e = body.exercises[i]
      const data = { exerciseId: e.exerciseId, name: e.name.trim(), prescription: txt(e.prescription), supersetGroup: txt(e.supersetGroup), order: i + 1 }
      if (e.id && w.exercises.some((x) => x.id === e.id)) await tx.workoutExercise.update({ where: { id: e.id }, data })
      else await tx.workoutExercise.create({ data: { ...data, workoutId: w.id } })
    }
  })
  return NextResponse.json({ ok: true })
}

/** Coach deletes a workout (and anything logged against it). */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { w, session } = await load(params.id)
  if (!w || !session) return NextResponse.json({ error: "Not found" }, { status: 404 })
  await prisma.workout.delete({ where: { id: w.id } })
  return NextResponse.json({ ok: true })
}
