import { getServerSession } from "next-auth"
import { notFound } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { dayKey, getLastTimes } from "@/lib/training"
import WorkoutPlayer from "@/components/client/WorkoutPlayer"

// Comments change outside this render, so never serve a cached copy.
export const dynamic = "force-dynamic"

export default async function ClientWorkout({ params }: { params: { id: string } }) {
  const session = (await getServerSession(authOptions))!
  const workout = await prisma.workout.findUnique({
    where: { id: params.id },
    include: {
      program: { select: { name: true, isDraft: true } },
      exercises: {
        orderBy: { order: "asc" },
        include: { exercise: { select: { id: true, name: true, videoUrl: true } } },
      },
      logs: {
        where: { userId: session.user.id },
        include: { exerciseLogs: { include: { setLogs: { orderBy: { setNumber: "asc" } } } } },
      },
      comments: { orderBy: { createdAt: "asc" } },
    },
  })
  if (!workout || workout.clientId !== session.user.id || workout.program?.isDraft) notFound()

  const [profile, coachLink] = await Promise.all([
    prisma.clientProfile.findUnique({ where: { userId: session.user.id } }),
    prisma.clientCoach.findFirst({
      where: { clientId: session.user.id, status: "ACTIVE" },
      select: { coach: { select: { coachProfile: { select: { defaultRestSeconds: true } } } } },
    }),
  ])
  const exercises = workout.exercises.map((e) => ({
    id: e.id,
    exerciseId: e.exerciseId,
    name: e.name ?? e.exercise?.name ?? "Exercise",
  }))
  const lastTimes = await getLastTimes(session.user.id, workout.id, exercises)
  const log = workout.logs[0]
  const byExercise = new Map(log?.exerciseLogs.map((x) => [x.workoutExerciseId, x]) ?? [])

  return (
    <WorkoutPlayer
      workout={{
        id: workout.id,
        name: workout.name,
        day: dayKey(workout.scheduledDate),
        programName: workout.program?.name ?? null,
        coachNotes: workout.coachNotes,
        warmup: workout.warmup,
        cooldown: workout.cooldown,
        description: workout.description,
        isCompleted: workout.isCompleted,
        notes: log?.notes ?? "",
        comments: workout.comments.map((c) => ({ id: c.id, author: c.authorName, body: c.body, at: c.createdAt.toISOString() })),
      }}
      exercises={workout.exercises.map((e) => {
        const x = byExercise.get(e.id)
        return {
          id: e.id,
          exerciseId: e.exerciseId,
          name: e.name ?? e.exercise?.name ?? "Exercise",
          prescription: e.prescription ?? ([e.sets && `${e.sets} sets`, e.reps && `${e.reps} reps`].filter(Boolean).join(" × ") || null),
          notes: e.notes,
          plannedSets: e.sets,
          videoUrl: e.exercise?.videoUrl ?? null,
          isCircuit: !!e.supersetGroup,
          lastTime: lastTimes[e.id],
          resultText: x?.resultText ?? "",
          rpe: x?.rpe ?? null,
          sets: x?.setLogs.map((s) => ({ reps: s.reps, weight: s.weight, rpe: s.rpe, done: s.isCompleted })) ?? [],
        }
      })}
      units={profile?.units ?? "lb"}
      defaultRestSeconds={coachLink?.coach.coachProfile?.defaultRestSeconds ?? 90}
      canMove={profile?.canMoveWorkouts ?? true}
    />
  )
}
