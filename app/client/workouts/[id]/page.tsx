import { notFound } from "next/navigation"
import { resolveMuscles, unlinkedNames } from "@/lib/muscles/resolve"
import { prisma } from "@/lib/prisma"
import { dayKey, getLastTimes } from "@/lib/training"
import { signDownloads } from "@/lib/uploads"
import WorkoutPlayer from "@/components/client/WorkoutPlayer"
import { requireClient } from "@/lib/require-client"
import { DEFAULT_MINUTES, planIsStale } from "@/lib/calendar-invite"

// Comments change outside this render, so never serve a cached copy.
export const dynamic = "force-dynamic"

export default async function ClientWorkout({ params }: { params: { id: string } }) {
  const session = await requireClient()
  const workout = await prisma.workout.findUnique({
    where: { id: params.id },
    include: {
      program: { select: { name: true, isDraft: true } },
      exercises: {
        orderBy: { order: "asc" },
        include: { exercise: { select: { id: true, name: true, videoUrl: true, tracking: true, primaryMuscles: true, secondaryMuscles: true } } },
      },
      logs: {
        where: { userId: session.user.id },
        include: { exerciseLogs: { include: { setLogs: { orderBy: { setNumber: "asc" } } } } },
      },
      comments: { orderBy: { createdAt: "asc" }, include: { attachments: true } },
    },
  })
  if (!workout || workout.clientId !== session.user.id || workout.program?.isDraft) notFound()

  // Rows imported without a library match still get chips from a library exercise of the same name
  // (ignoring case), found in one query for the whole session.
  const names = unlinkedNames(workout.exercises)
  const [profile, coachLink, sameName, lastPlan] = await Promise.all([
    prisma.clientProfile.findUnique({ where: { userId: session.user.id } }),
    prisma.clientCoach.findFirst({
      where: { clientId: session.user.id, status: "ACTIVE" },
      select: { coachId: true, coach: { select: { name: true, coachProfile: { select: { defaultRestSeconds: true, textNumber: true } } } } },
    }),
    names.length
      ? prisma.exerciseLibrary.findMany({
          where: { OR: names.map((n) => ({ name: { equals: n, mode: "insensitive" as const } })) },
          select: { name: true, primaryMuscles: true, secondaryMuscles: true },
        })
      : Promise.resolve([]),
    prisma.workout.findFirst({
      where: { clientId: session.user.id, plannedAt: { not: null } },
      orderBy: { plannedAt: "desc" },
      select: { plannedTime: true, plannedMinutes: true },
    }),
  ])
  // Same rule as Today's "Book a session" card: a number to text, or a place to train.
  const canBookSession =
    !!coachLink && (!!coachLink.coach.coachProfile?.textNumber || (await prisma.sessionLocation.count({ where: { coachId: coachLink.coachId } })) > 0)
  const exercises = workout.exercises.map((e) => ({
    id: e.id,
    exerciseId: e.exerciseId,
    name: e.name ?? e.exercise?.name ?? "Exercise",
  }))
  const lastTimes = await getLastTimes(session.user.id, workout.id, exercises)
  const signed = await signDownloads(workout.comments.flatMap((c) => c.attachments.map((a) => a.path)))
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
        comments: workout.comments.map((c) => ({ id: c.id, author: c.authorName, body: c.body, at: c.createdAt.toISOString(), mine: c.authorId === session.user.id, attachments: c.attachments.map((a) => ({ id: a.id, mime: a.mime, url: signed[a.path] ?? null })) })),
      }}
      exercises={workout.exercises.map((e) => {
        const x = byExercise.get(e.id)
        const muscles = resolveMuscles(e, sameName)
        return {
          id: e.id,
          exerciseId: e.exerciseId,
          name: e.name ?? e.exercise?.name ?? "Exercise",
          prescription: e.prescription ?? ([e.sets && `${e.sets} sets`, e.reps && `${e.reps} reps`].filter(Boolean).join(" × ") || null),
          reps: e.reps,
          libraryTracking: e.exercise?.tracking ?? null,
          restSeconds: e.restSeconds,
          notes: e.notes,
          plannedSets: e.sets,
          videoUrl: e.exercise?.videoUrl ?? null,
          isCircuit: !!e.supersetGroup,
          lastTime: lastTimes[e.id],
          resultText: x?.resultText ?? "",
          rpe: x?.rpe ?? null,
          sets: x?.setLogs.map((s) => ({ reps: s.reps, weight: s.weight, rpe: s.rpe, done: s.isCompleted })) ?? [],
          primaryMuscles: muscles.primary,
          secondaryMuscles: muscles.secondary,
        }
      })}
      units={profile?.units ?? "lb"}
      defaultRestSeconds={coachLink?.coach.coachProfile?.defaultRestSeconds ?? 90}
      canMove={profile?.canMoveWorkouts ?? true}
      scheduling={{
        session: {
          id: workout.id,
          day: dayKey(workout.scheduledDate),
          name: workout.name,
          exerciseNames: exercises.map((e) => e.name),
          plan: workout.plannedTime ? { time: workout.plannedTime, minutes: workout.plannedMinutes ?? DEFAULT_MINUTES } : null,
          planStale: !!workout.plannedTime && planIsStale(workout.plannedAt, workout.movedAt),
        },
        defaults: {
          time: lastPlan?.plannedTime ?? "07:00",
          minutes: lastPlan?.plannedMinutes ?? DEFAULT_MINUTES,
          bookHref: canBookSession ? "/client/book/session" : null,
          coachName: coachLink?.coach.name ?? null,
        },
      }}
    />
  )
}
