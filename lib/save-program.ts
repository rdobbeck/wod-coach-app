import { prisma } from "./prisma"
import { buildExerciseMatcher } from "./exercise-match"
import { fromDayKey } from "./training"

type ExerciseData = {
  name: string
  prescription?: string | null
  sets?: number | null
  reps?: string | null
  restSeconds?: number | null
  tempo?: string | null
  notes?: string | null
  supersetGroup?: string | null
}
export type ProgramData = {
  programName: string
  description?: string
  rationale?: string
  totalWeeks: number
  mesocycles: {
    name: string
    focus: string
    description?: string
    durationWeeks: number
    microcycles: {
      weekNumber: number
      description?: string | null
      workouts: { dayOfWeek: number; name: string; description?: string | null; warmup?: string | null; exercises: ExerciseData[] }[]
    }[]
  }[]
}

const DAY = 86_400_000

/**
 * Put a generated program on a client's calendar. Week 1 starts on startDate
 * ("YYYY-MM-DD", default today); a workout's dayOfWeek is its offset (0-6) in
 * its week. Exercises are linked to the library by name; unmatched ones stay as
 * text rows (no new library entries). Caller must have checked coach access.
 */
export async function saveProgramToCalendar({
  programData,
  clientId,
  coachUserId,
  startDate,
  draft = false,
}: {
  programData: ProgramData
  clientId: string
  coachUserId: string
  startDate?: string
  draft?: boolean // hidden from the client until the coach publishes it
}) {
  const start = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? fromDayKey(startDate) : fromDayKey(new Date().toISOString().slice(0, 10))
  const totalWeeks = programData.mesocycles.reduce((n, m) => n + m.durationWeeks, 0)
  const match = await buildExerciseMatcher(prisma)
  let linked = 0
  let rows = 0

  const program = await prisma.$transaction(
    async (tx) => {
      const newProgram = await tx.program.create({
        data: {
          name: programData.programName,
          description: programData.description,
          startDate: start,
          endDate: new Date(start.getTime() + (totalWeeks * 7 - 1) * DAY),
          coachId: coachUserId,
          clientId,
          isActive: true,
          isDraft: draft,
          programType: "AI_GENERATED",
          aiRationale: programData.rationale,
        },
      })

      let weekOffset = 0
      for (let mi = 0; mi < programData.mesocycles.length; mi++) {
        const meso = programData.mesocycles[mi]
        const mesoStart = new Date(start.getTime() + weekOffset * 7 * DAY)
        const mesocycle = await tx.mesocycle.create({
          data: {
            programId: newProgram.id,
            name: meso.name,
            focus: meso.focus,
            description: meso.description,
            startDate: mesoStart,
            endDate: new Date(mesoStart.getTime() + (meso.durationWeeks * 7 - 1) * DAY),
            order: mi,
          },
        })

        for (const micro of meso.microcycles) {
          const weekStart = new Date(mesoStart.getTime() + (micro.weekNumber - 1) * 7 * DAY)
          const microcycle = await tx.microcycle.create({
            data: {
              mesocycleId: mesocycle.id,
              weekNumber: micro.weekNumber,
              description: micro.description ?? null,
              startDate: weekStart,
              endDate: new Date(weekStart.getTime() + 6 * DAY),
            },
          })

          for (let wi = 0; wi < micro.workouts.length; wi++) {
            const w = micro.workouts[wi]
            const date = new Date(weekStart.getTime() + Math.min(Math.max(w.dayOfWeek, 0), 6) * DAY)
            await tx.workout.create({
              data: {
                microcycleId: microcycle.id,
                clientId,
                programId: newProgram.id,
                name: w.name,
                coachNotes: w.description || null,
                warmup: w.warmup || null,
                scheduledDate: date,
                dayOfWeek: date.getUTCDay(),
                order: wi + 1,
                exercises: {
                  create: w.exercises.map((ex, ei) => {
                    const exerciseId = match(ex.name)
                    rows++
                    if (exerciseId) linked++
                    return {
                      exerciseId,
                      name: (exerciseId && match.libraryName(exerciseId)) || ex.name,
                      prescription: ex.prescription || [ex.sets && `${ex.sets} sets`, ex.reps && `${ex.reps} reps`].filter(Boolean).join(" x ") || null,
                      sets: ex.sets ?? null,
                      reps: ex.reps ?? null,
                      restSeconds: ex.restSeconds ?? null,
                      tempo: ex.tempo ?? null,
                      notes: ex.notes ?? null,
                      supersetGroup: ex.supersetGroup ?? null,
                      order: ei + 1,
                    }
                  }),
                },
              },
            })
          }
        }
        weekOffset += meso.durationWeeks
      }
      return newProgram
    },
    { timeout: 55_000 }
  )

  return { programId: program.id, exercisesLinked: linked, exerciseRows: rows }
}
