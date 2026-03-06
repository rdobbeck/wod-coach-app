import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || session.user.role !== "COACH") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { programData, clientId } = body

    if (!programData || !clientId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Calculate program dates
    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(startDate.getDate() + (programData.totalWeeks * 7))

    // Save program with all nested data in a transaction
    const program = await prisma.$transaction(async (tx) => {
      // Create the main program
      const newProgram = await tx.program.create({
        data: {
          name: programData.programName,
          description: programData.description,
          startDate,
          endDate,
          coachId: session.user.id,
          clientId,
          isActive: true,
          programType: "AI_GENERATED",
          aiRationale: programData.rationale,
        },
      })

      // Create mesocycles
      let currentDate = new Date(startDate)

      for (const mesoData of programData.mesocycles) {
        const mesoStartDate = new Date(currentDate)
        const mesoEndDate = new Date(currentDate)
        mesoEndDate.setDate(mesoEndDate.getDate() + (mesoData.durationWeeks * 7))

        const mesocycle = await tx.mesocycle.create({
          data: {
            programId: newProgram.id,
            name: mesoData.name,
            focus: mesoData.focus,
            description: mesoData.description,
            startDate: mesoStartDate,
            endDate: mesoEndDate,
            orderIndex: programData.mesocycles.indexOf(mesoData),
          },
        })

        // Create microcycles (weeks)
        for (const microData of mesoData.microcycles) {
          const microStartDate = new Date(mesoStartDate)
          microStartDate.setDate(microStartDate.getDate() + ((microData.weekNumber - 1) * 7))
          const microEndDate = new Date(microStartDate)
          microEndDate.setDate(microEndDate.getDate() + 7)

          const microcycle = await tx.microcycle.create({
            data: {
              mesocycleId: mesocycle.id,
              weekNumber: microData.weekNumber,
              description: microData.description,
              startDate: microStartDate,
              endDate: microEndDate,
            },
          })

          // Create workouts
          for (const workoutData of microData.workouts) {
            const workoutDate = new Date(microStartDate)
            workoutDate.setDate(workoutDate.getDate() + workoutData.dayOfWeek)

            const workout = await tx.workout.create({
              data: {
                microcycleId: microcycle.id,
                name: workoutData.name,
                description: workoutData.description || null,
                scheduledDate: workoutDate,
                isCompleted: false,
              },
            })

            // Create exercises for this workout
            for (const exData of workoutData.exercises) {
              // Find or create exercise in library
              let exercise = await tx.exerciseLibrary.findFirst({
                where: {
                  name: { equals: exData.name, mode: 'insensitive' },
                },
              })

              if (!exercise) {
                // Create new exercise
                exercise = await tx.exerciseLibrary.create({
                  data: {
                    name: exData.name,
                    category: "OTHER", // Default category
                    muscleGroups: [],
                    equipment: [],
                    difficulty: "INTERMEDIATE",
                    isPublic: false,
                  },
                })
              }

              // Add exercise to workout
              await tx.workoutExercise.create({
                data: {
                  workoutId: workout.id,
                  exerciseId: exercise.id,
                  sets: exData.sets,
                  reps: exData.reps,
                  restSeconds: exData.restSeconds,
                  tempo: exData.tempo,
                  notes: exData.notes,
                  orderIndex: workoutData.exercises.indexOf(exData),
                },
              })
            }
          }
        }

        // Move current date forward for next mesocycle
        currentDate = new Date(mesoEndDate)
      }

      return newProgram
    })

    return NextResponse.json({
      success: true,
      programId: program.id,
      program,
    })
  } catch (error: any) {
    console.error("Save program error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to save program" },
      { status: 500 }
    )
  }
}
