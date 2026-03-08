import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import DashboardHeader from "@/components/DashboardHeader"

export default async function ProgramDetailPage({
  params,
}: {
  params: { programId: string }
}) {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== "COACH") {
    redirect("/")
  }

  const program = await prisma.program.findFirst({
    where: {
      id: params.programId,
      coachId: session.user.id,
    },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      mesocycles: {
        include: {
          microcycles: {
            include: {
              workouts: {
                include: {
                  exercises: {
                    include: {
                      exercise: true,
                    },
                  },
                },
                orderBy: {
                  dayOfWeek: "asc",
                },
              },
            },
            orderBy: {
              weekNumber: "asc",
            },
          },
        },
        orderBy: {
          order: "asc",
        },
      },
    },
  })

  if (!program) {
    redirect("/coach/programs")
  }

  // Calculate total weeks from start and end dates
  const totalWeeks = program.endDate
    ? Math.ceil((new Date(program.endDate).getTime() - new Date(program.startDate).getTime()) / (7 * 24 * 60 * 60 * 1000))
    : 0

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <Link
          href="/coach/programs"
          className="text-primary-600 hover:text-primary-700 mb-6 inline-block"
        >
          ← Back to All Programs
        </Link>

        {/* Program Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{program.name}</h1>
              {program.client && (
                <Link
                  href={`/coach/clients/${program.client.id}`}
                  className="text-primary-600 hover:text-primary-700"
                >
                  {program.client.name} ({program.client.email})
                </Link>
              )}
            </div>
            <span
              className={`px-3 py-1 text-sm font-semibold rounded-full ${
                program.isActive
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {program.isActive ? "Active" : "Inactive"}
            </span>
          </div>

          {program.description && (
            <p className="text-gray-600 mb-4">{program.description}</p>
          )}

          {program.aiRationale && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">Program Rationale</h3>
              <p className="text-sm text-blue-800">{program.aiRationale}</p>
            </div>
          )}
        </div>

        {/* Program Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Duration</div>
            <div className="text-2xl font-bold text-gray-900">{totalWeeks} weeks</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Mesocycles</div>
            <div className="text-2xl font-bold text-gray-900">{program.mesocycles.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Start Date</div>
            <div className="text-lg font-semibold text-gray-900">
              {new Date(program.startDate).toLocaleDateString()}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">End Date</div>
            <div className="text-lg font-semibold text-gray-900">
              {program.endDate ? new Date(program.endDate).toLocaleDateString() : "Ongoing"}
            </div>
          </div>
        </div>

        {/* Mesocycles */}
        <div className="space-y-6">
          {program.mesocycles.map((mesocycle, mesoIndex) => (
            <div key={mesocycle.id} className="bg-white rounded-lg shadow p-6">
              <div className="mb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                      {mesocycle.name || `Mesocycle ${mesoIndex + 1}`}
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      {Math.ceil((new Date(mesocycle.endDate).getTime() - new Date(mesocycle.startDate).getTime()) / (7 * 24 * 60 * 60 * 1000))} weeks • Focus: {mesocycle.focus}
                    </p>
                  </div>
                </div>
                {mesocycle.description && (
                  <p className="text-gray-600 mt-3">{mesocycle.description}</p>
                )}
              </div>

              {/* Microcycles (Weeks) */}
              <div className="space-y-4">
                {mesocycle.microcycles.map((microcycle) => (
                  <div key={microcycle.id} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-2">
                      Week {microcycle.weekNumber}
                    </h3>
                    {microcycle.description && (
                      <p className="text-sm text-gray-600 mb-3">{microcycle.description}</p>
                    )}

                    {/* Workouts */}
                    <div className="space-y-3">
                      {microcycle.workouts.map((workout) => (
                        <div key={workout.id} className="bg-gray-50 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="font-semibold text-gray-900">
                                Day {workout.dayOfWeek}: {workout.name}
                              </h4>
                              {workout.description && (
                                <p className="text-sm text-gray-600 mt-1">{workout.description}</p>
                              )}
                            </div>
                          </div>

                          {/* Exercises */}
                          <div className="space-y-2">
                            {workout.exercises.map((exercise, exIndex) => (
                              <div
                                key={exercise.id}
                                className="flex items-start text-sm bg-white rounded p-3"
                              >
                                <div className="font-medium text-gray-500 mr-3">
                                  {exIndex + 1}.
                                </div>
                                <div className="flex-1">
                                  <div className="font-semibold text-gray-900">
                                    {exercise.exercise.name}
                                  </div>
                                  <div className="text-gray-600 mt-1">
                                    {exercise.sets} sets × {exercise.reps} reps
                                    {exercise.restSeconds && (
                                      <> • {exercise.restSeconds}s rest</>
                                    )}
                                    {exercise.tempo && <> • Tempo: {exercise.tempo}</>}
                                  </div>
                                  {exercise.notes && (
                                    <div className="text-gray-500 text-xs mt-1">
                                      {exercise.notes}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
