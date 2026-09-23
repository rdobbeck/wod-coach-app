import { getServerSession } from "next-auth"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import DashboardHeader from "@/components/DashboardHeader"
import CoachWorkout from "@/components/coach/CoachWorkout"
import { coachOf } from "@/lib/coach-access"
import { dayKey, getLastTimes } from "@/lib/training"

// Comments change outside this render, so never serve a cached copy.
export const dynamic = "force-dynamic"

export default async function CoachWorkoutPage({
  params,
  searchParams,
}: {
  params: { clientId: string; workoutId: string }
  searchParams: { edit?: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") redirect("/")
  if (!(await coachOf(params.clientId))) notFound()

  const workout = await prisma.workout.findFirst({
    where: { id: params.workoutId, clientId: params.clientId },
    include: {
      client: { select: { name: true, clientProfile: { select: { units: true } } } },
      exercises: { orderBy: { order: "asc" }, include: { exercise: { select: { name: true, videoUrl: true } } } },
      logs: { include: { exerciseLogs: { include: { setLogs: { orderBy: { setNumber: "asc" } } } } } },
      comments: { orderBy: { createdAt: "asc" } },
    },
  })
  if (!workout) notFound()

  const refs = workout.exercises.map((e) => ({ id: e.id, exerciseId: e.exerciseId, name: e.name ?? e.exercise?.name ?? "Exercise" }))
  const lastTimes = await getLastTimes(params.clientId, workout.id, refs)
  const log = workout.logs[0]
  const logged = new Map(log?.exerciseLogs.map((x) => [x.workoutExerciseId, x]) ?? [])

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Link href={`/coach/clients/${params.clientId}`} className="text-sm text-primary-600">← {workout.client?.name ?? "Client"}</Link>
        <CoachWorkout
          clientId={params.clientId}
          startInEdit={searchParams.edit === "1"}
          units={workout.client?.clientProfile?.units ?? "lb"}
          workout={{
            id: workout.id,
            name: workout.name,
            day: dayKey(workout.scheduledDate),
            originalDay: workout.originalDate ? dayKey(workout.originalDate) : null,
            isCompleted: workout.isCompleted,
            coachNotes: workout.coachNotes ?? "",
            warmup: workout.warmup ?? "",
            cooldown: workout.cooldown ?? "",
            description: workout.description,
            clientNotes: log?.notes ?? null,
            comments: workout.comments.map((c) => ({ id: c.id, author: c.authorName, body: c.body, at: c.createdAt.toISOString() })),
          }}
          exercises={workout.exercises.map((e) => {
            const x = logged.get(e.id)
            return {
              id: e.id,
              exerciseId: e.exerciseId,
              name: e.name ?? e.exercise?.name ?? "Exercise",
              linked: !!e.exerciseId,
              hasVideo: !!e.exercise?.videoUrl,
              videoUrl: e.exercise?.videoUrl ?? null,
              prescription: e.prescription ?? "",
              supersetGroup: e.supersetGroup ?? "",
              lastTime: lastTimes[e.id],
              logged: x
                ? { resultText: x.resultText, rpe: x.rpe, sets: x.setLogs.map((s) => ({ setNumber: s.setNumber, reps: s.reps, weight: s.weight, rpe: s.rpe })) }
                : null,
            }
          })}
        />
      </div>
    </div>
  )
}
