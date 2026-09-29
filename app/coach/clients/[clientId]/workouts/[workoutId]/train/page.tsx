import { notFound, redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { coachOf } from "@/lib/coach-access"
import { dayKey, getLastTimes } from "@/lib/training"
import { resolveTheme } from "@/lib/themes"
import { signDownloads } from "@/lib/uploads"
import WorkoutPlayer from "@/components/client/WorkoutPlayer"

export const dynamic = "force-dynamic"

/**
 * Train mode: the coach runs this session for the client in person, on the
 * client's own screen (their theme, their units, their history), and every
 * set is saved under the client's record.
 */
export default async function TrainPage({ params }: { params: { clientId: string; workoutId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") redirect("/")
  if (!(await coachOf(params.clientId))) notFound()

  const workout = await prisma.workout.findFirst({
    where: { id: params.workoutId, clientId: params.clientId },
    include: {
      client: { select: { name: true, clientProfile: { select: { units: true, theme: true } } } },
      program: { select: { name: true } },
      exercises: { orderBy: { order: "asc" }, include: { exercise: { select: { id: true, name: true, videoUrl: true } } } },
      logs: {
        where: { userId: params.clientId },
        include: { exerciseLogs: { include: { setLogs: { orderBy: { setNumber: "asc" } } } } },
      },
      comments: { orderBy: { createdAt: "asc" }, include: { attachments: true } },
    },
  })
  if (!workout) notFound()

  const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: session.user.id }, select: { defaultRestSeconds: true } })
  const refs = workout.exercises.map((e) => ({ id: e.id, exerciseId: e.exerciseId, name: e.name ?? e.exercise?.name ?? "Exercise" }))
  const lastTimes = await getLastTimes(params.clientId, workout.id, refs)
  const signed = await signDownloads(workout.comments.flatMap((c) => c.attachments.map((a) => a.path)))
  const log = workout.logs[0]
  const byExercise = new Map(log?.exerciseLogs.map((x) => [x.workoutExerciseId, x]) ?? [])
  const clientName = workout.client?.name || "your client"
  const exitHref = `/coach/clients/${params.clientId}/workouts/${params.workoutId}`

  return (
    <div data-app-theme={resolveTheme(workout.client?.clientProfile?.theme)} className="min-h-screen bg-app-bg font-sans text-app-text">
      <link rel="preconnect" href="https://www.youtube-nocookie.com" />
      <link rel="preconnect" href="https://i.ytimg.com" />
      <main className="mx-auto max-w-md px-4 pt-4 pb-8">
        <p className="mb-3 font-display text-xs font-semibold uppercase tracking-[0.16em] text-app-accent">Coaching {clientName}</p>
        <WorkoutPlayer
          coaching={{ clientId: params.clientId, clientName, exitHref }}
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
            return {
              id: e.id,
              exerciseId: e.exerciseId,
              name: e.name ?? e.exercise?.name ?? "Exercise",
              prescription: e.prescription ?? ([e.sets && `${e.sets} sets`, e.reps && `${e.reps} reps`].filter(Boolean).join(" × ") || null),
              reps: e.reps,
              restSeconds: e.restSeconds,
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
          units={workout.client?.clientProfile?.units ?? "lb"}
          defaultRestSeconds={coachProfile?.defaultRestSeconds ?? 90}
          canMove
        />
      </main>
    </div>
  )
}
