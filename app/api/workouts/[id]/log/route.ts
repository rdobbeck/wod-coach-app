import { NextResponse } from "next/server"
import { withAlert } from "@/lib/alert"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canAccessClient } from "@/lib/training"
import { exerciseKey } from "@/lib/exercise-key"

type SetInput = { reps?: number | null; weight?: number | null; rpe?: number | null }
type ExerciseInput = {
  workoutExerciseId: string
  resultText?: string | null
  rpe?: number | null
  sets?: SetInput[]
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)

/**
 * Save progress on a workout (called on every change, so it's an upsert).
 * Body: { exercises?: ExerciseInput[], notes?: string, complete?: boolean }.
 * The client logs their own workouts; their coach can log for them too
 * (in-person sessions). Entries with no result, RPE or sets are removed so
 * exercise history only shows real attempts.
 */
async function handlePUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await req.json()) as { exercises?: ExerciseInput[]; notes?: string; complete?: boolean }
  const workout = await prisma.workout.findUnique({
    where: { id: params.id },
    include: { exercises: { include: { exercise: { select: { name: true } } } } },
  })
  if (!workout?.clientId || !(await canAccessClient(session.user.id, workout.clientId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (session.user.id === workout.clientId && workout.programId) {
    const program = await prisma.program.findUnique({ where: { id: workout.programId }, select: { isDraft: true } })
    if (program?.isDraft) return NextResponse.json({ error: "Not found" }, { status: 404 }) // unpublished
  }
  const clientId = workout.clientId
  const byId = new Map(workout.exercises.map((e) => [e.id, e]))

  await prisma.$transaction(async (tx) => {
    const log = await tx.workoutLog.upsert({
      where: { workoutId_userId: { workoutId: workout.id, userId: clientId } },
      update: {
        ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
        ...(body.complete ? { completedAt: new Date() } : {}),
      },
      create: { workoutId: workout.id, userId: clientId, notes: body.notes || null },
    })

    for (const input of body.exercises ?? []) {
      const we = byId.get(input.workoutExerciseId)
      if (!we) continue
      const sets = (input.sets ?? [])
        .map((s) => ({ reps: num(s.reps), weight: num(s.weight), rpe: num(s.rpe) }))
        .filter((s) => s.reps !== null || s.weight !== null || s.rpe !== null)
      const resultText = input.resultText?.trim() || null
      const rpe = num(input.rpe)
      const key = { workoutLogId_workoutExerciseId: { workoutLogId: log.id, workoutExerciseId: we.id } }

      if (!resultText && rpe === null && !sets.length) {
        await tx.exerciseLog.deleteMany({ where: { workoutLogId: log.id, workoutExerciseId: we.id } })
        continue
      }
      const data = {
        userId: clientId,
        exerciseId: we.exerciseId,
        exerciseKey: exerciseKey(we.name ?? we.exercise?.name ?? ""),
        resultText,
        rpe,
        performedAt: workout.scheduledDate,
      }
      const xl = await tx.exerciseLog.upsert({
        where: key,
        update: data,
        create: { ...data, workoutLogId: log.id, workoutExerciseId: we.id },
      })
      await tx.setLog.deleteMany({ where: { exerciseLogId: xl.id } })
      if (sets.length) {
        await tx.setLog.createMany({
          data: sets.map((s, i) => ({
            workoutLogId: log.id,
            workoutExerciseId: we.id,
            exerciseLogId: xl.id,
            setNumber: i + 1,
            ...s,
          })),
        })
      }
    }

    if (body.complete) {
      await tx.workout.update({ where: { id: workout.id }, data: { isCompleted: true } })
    }
  })

  return NextResponse.json({ ok: true })
}

export const PUT = withAlert("workouts/log", handlePUT)
