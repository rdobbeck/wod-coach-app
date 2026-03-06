import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import DashboardHeader from "@/components/DashboardHeader"

export default async function ClientDashboard() {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== "CLIENT") {
    redirect("/")
  }

  const coaches = await prisma.clientCoach.findMany({
    where: {
      clientId: session.user.id,
      status: "ACTIVE"
    },
    include: {
      coach: {
        include: {
          coachProfile: true
        }
      }
    }
  })

  const programs = await prisma.program.findMany({
    where: {
      clientId: session.user.id,
      isActive: true
    },
    include: {
      mesocycles: {
        include: {
          microcycles: {
            include: {
              workouts: {
                where: {
                  scheduledDate: {
                    gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                  }
                },
                include: {
                  exercises: {
                    include: {
                      exercise: true
                    }
                  },
                  logs: {
                    where: {
                      userId: session.user.id
                    }
                  }
                },
                orderBy: {
                  scheduledDate: "asc"
                }
              }
            }
          }
        }
      }
    }
  })

  const allWorkouts = programs.flatMap(p => 
    p.mesocycles.flatMap(m => 
      m.microcycles.flatMap(mc => mc.workouts)
    )
  )

  const upcomingWorkouts = allWorkouts.filter(w => 
    new Date(w.scheduledDate) >= new Date() && !w.isCompleted
  ).slice(0, 5)

  const completedWorkouts = allWorkouts.filter(w => w.isCompleted)

  const todayWorkouts = allWorkouts.filter(w => {
    const today = new Date()
    const workoutDate = new Date(w.scheduledDate)
    return (
      workoutDate.getDate() === today.getDate() &&
      workoutDate.getMonth() === today.getMonth() &&
      workoutDate.getFullYear() === today.getFullYear()
    )
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader userName={session.user.name || "Client"} role="CLIENT" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Dashboard</h1>
          <p className="mt-2 text-gray-600">Welcome back, {session.user.name}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">Today's Workouts</div>
            <div className="mt-2 text-3xl font-semibold text-gray-900">{todayWorkouts.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">Completed This Week</div>
            <div className="mt-2 text-3xl font-semibold text-gray-900">{completedWorkouts.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">Active Programs</div>
            <div className="mt-2 text-3xl font-semibold text-gray-900">{programs.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">Messages</div>
            <div className="mt-2 text-3xl font-semibold text-gray-900">0</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Link
              href="/client/workouts"
              className="bg-primary-600 text-white rounded-lg px-4 py-3 text-center hover:bg-primary-700 transition"
            >
              View Workouts
            </Link>
            <Link
              href="/client/progress"
              className="bg-white border-2 border-gray-300 rounded-lg px-4 py-3 text-center hover:border-primary-600 transition"
            >
              Track Progress
            </Link>
            <Link
              href="/client/messages"
              className="bg-white border-2 border-gray-300 rounded-lg px-4 py-3 text-center hover:border-primary-600 transition"
            >
              Message Coach
            </Link>
            <Link
              href="/client/profile"
              className="bg-white border-2 border-gray-300 rounded-lg px-4 py-3 text-center hover:border-primary-600 transition"
            >
              Update Profile
            </Link>
          </div>
        </div>

        {/* Today's Workout */}
        {todayWorkouts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Today's Workout</h2>
            {todayWorkouts.map((workout) => (
              <div key={workout.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{workout.name}</h3>
                    {workout.description && (
                      <p className="text-gray-600 mt-1">{workout.description}</p>
                    )}
                  </div>
                  <Link
                    href={`/client/workouts/${workout.id}`}
                    className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition"
                  >
                    {workout.logs.length > 0 ? "View Log" : "Start Workout"}
                  </Link>
                </div>
                <div className="space-y-2">
                  {workout.exercises.map((we, idx) => (
                    <div key={we.id} className="flex items-center text-sm">
                      <span className="text-gray-500 w-8">{idx + 1}.</span>
                      <span className="flex-1 font-medium">{we.exercise.name}</span>
                      <span className="text-gray-600">{we.sets} sets × {we.reps} reps</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming Workouts */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Upcoming Workouts</h2>
            <Link href="/client/workouts" className="text-primary-600 hover:text-primary-700">
              View All →
            </Link>
          </div>
          {upcomingWorkouts.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <p className="text-gray-500">No upcoming workouts scheduled. Contact your coach!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcomingWorkouts.map((workout) => (
                <Link
                  key={workout.id}
                  href={`/client/workouts/${workout.id}`}
                  className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
                >
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-semibold text-gray-900">{workout.name}</h3>
                    {workout.logs.length > 0 && (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                        Completed
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    {workout.exercises.length} exercises
                  </p>
                  <div className="text-sm text-gray-500">
                    {new Date(workout.scheduledDate).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* My Coaches */}
        {coaches.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">My Coaches</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {coaches.map((clientCoach) => (
                <div key={clientCoach.id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center mb-4">
                    <div className="flex-shrink-0 h-12 w-12 bg-primary-100 rounded-full flex items-center justify-center">
                      <span className="text-primary-600 font-medium text-lg">
                        {clientCoach.coach.name?.[0] || "?"}
                      </span>
                    </div>
                    <div className="ml-4">
                      <div className="text-lg font-semibold text-gray-900">
                        {clientCoach.coach.name}
                      </div>
                      <div className="text-sm text-gray-500">{clientCoach.coach.email}</div>
                    </div>
                  </div>
                  {clientCoach.coach.coachProfile?.specialties && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {clientCoach.coach.coachProfile.specialties.map((specialty) => (
                        <span
                          key={specialty}
                          className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded"
                        >
                          {specialty}
                        </span>
                      ))}
                    </div>
                  )}
                  <Link
                    href={`/client/messages?coachId=${clientCoach.coachId}`}
                    className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                  >
                    Send Message →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
