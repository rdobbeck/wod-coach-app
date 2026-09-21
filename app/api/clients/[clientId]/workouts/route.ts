import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { coachOf } from "@/lib/coach-access"
import { fromDayKey } from "@/lib/training"

/**
 * Coach adds a workout for a client on a date. Body: { date, name?, copyFromWorkoutId? }.
 * With copyFromWorkoutId it duplicates that workout (notes + exercises, no logs).
 */
export async function POST(req: Request, { params }: { params: { clientId: string } }) {
  const session = await coachOf(params.clientId)
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const { date, name, copyFromWorkoutId } = (await req.json()) as { date?: string; name?: string; copyFromWorkoutId?: string }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 })

  const src = copyFromWorkoutId
    ? await prisma.workout.findFirst({
        where: { id: copyFromWorkoutId, clientId: params.clientId },
        include: { exercises: { orderBy: { order: "asc" } } },
      })
    : null
  const day = fromDayKey(date)
  const count = await prisma.workout.count({ where: { clientId: params.clientId, scheduledDate: day } })
  const created = await prisma.workout.create({
    data: {
      clientId: params.clientId,
      programId: src?.programId ?? null,
      name: name?.trim() || src?.name || "New workout",
      coachNotes: src?.coachNotes,
      warmup: src?.warmup,
      cooldown: src?.cooldown,
      scheduledDate: day,
      dayOfWeek: day.getUTCDay(),
      order: count + 1,
      exercises: src
        ? {
            create: src.exercises.map((e) => ({
              exerciseId: e.exerciseId, name: e.name, prescription: e.prescription, supersetGroup: e.supersetGroup,
              order: e.order, sets: e.sets, reps: e.reps, weight: e.weight, restSeconds: e.restSeconds, tempo: e.tempo, notes: e.notes,
            })),
          }
        : undefined,
    },
  })
  return NextResponse.json({ id: created.id })
}
