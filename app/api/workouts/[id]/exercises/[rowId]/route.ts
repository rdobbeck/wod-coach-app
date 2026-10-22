import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withAlert } from "@/lib/alert"
import { notifyUser } from "@/lib/notify"
import { prisma } from "@/lib/prisma"
import { coachOf } from "@/lib/coach-access"
import { getLastTimes } from "@/lib/training"
import { inferMuscles } from "@/lib/muscles/infer"
import { patternsFromName, rankSwaps, type SwapRow } from "@/lib/swap"

/**
 * One exercise in a session, swapped in place mid-workout (no trip back to
 * the editor). GET suggests swaps that train the same thing; PATCH
 * { exerciseId, name } makes the swap.
 *
 * The client's coach can swap anything. The client can swap in their own
 * sessions that aren't finished or unpublished, and only to a library
 * exercise; each client swap leaves a note in the workout's comments and
 * pings their coaches, so the coach always knows what changed.
 */

const ROW = { id: true, name: true, exerciseId: true, workout: { select: { id: true, name: true, clientId: true, isCompleted: true, program: { select: { isDraft: true } } } }, exercise: { select: { name: true, muscleGroups: true, primaryMuscles: true, secondaryMuscles: true } } } as const

async function load(workoutId: string, rowId: string) {
  const row = await prisma.workoutExercise.findFirst({ where: { id: rowId, workoutId }, select: ROW })
  if (!row?.workout.clientId) return null
  if (await coachOf(row.workout.clientId)) return { row, by: "coach" as const, name: "" }
  const session = await getServerSession(authOptions)
  if (session?.user.id !== row.workout.clientId || row.workout.isCompleted || row.workout.program?.isDraft) return null
  return { row, by: "client" as const, name: session.user.name ?? "Your client" }
}

const LIB = { id: true, name: true, videoUrl: true, equipment: true, muscleGroups: true, primaryMuscles: true, secondaryMuscles: true } as const
const toSwapRow = (r: { id: string; name: string; videoUrl: string | null; equipment: string[]; muscleGroups: string[]; primaryMuscles: string[]; secondaryMuscles: string[] }): SwapRow => ({
  id: r.id, name: r.name, videoUrl: r.videoUrl, equipment: r.equipment, patterns: r.muscleGroups, primary: r.primaryMuscles, secondary: r.secondaryMuscles,
})

async function handleGET(_req: Request, { params }: { params: { id: string; rowId: string } }) {
  const row = (await load(params.id, params.rowId))?.row
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const name = row.name ?? row.exercise?.name ?? ""

  // One query at a time and only the rows that can match: the app's pooled connection is a single
  // one per instance, and loading the whole library plus usage at once timed it out.
  // What this exercise trains: its own library entry, filled in from same-name entries
  // (the library has duplicates, and only some carry a pattern), then from the name.
  const own = row.exercise
  const needTwins = !own?.primaryMuscles.length || !own.muscleGroups.length
  const twins = name && needTwins ? await prisma.exerciseLibrary.findMany({ where: { name: { equals: name, mode: "insensitive" } }, select: LIB, take: 10 }) : []
  const pick = (own: string[] | undefined, from: (r: (typeof twins)[number]) => string[]) => (own?.length ? own : twins.map(from).find((x) => x.length) ?? [])
  let primary = pick(row.exercise?.primaryMuscles, (r) => r.primaryMuscles)
  let secondary = pick(row.exercise?.secondaryMuscles, (r) => r.secondaryMuscles)
  if (!primary.length) ({ primary, secondary } = inferMuscles(name))
  let patterns = pick(row.exercise?.muscleGroups, (r) => r.muscleGroups)
  if (!patterns.length) patterns = patternsFromName(name)
  if (!primary.length && !patterns.length) return NextResponse.json({ suggestions: [] })

  // The database narrows and orders the field (shared primary muscles, then pattern, then how
  // often the coach programs it) and sends back only the best 120 with their use counts: one small
  // reply instead of a fifth of the library.
  const found = await prisma.$queryRaw<
    { id: string; name: string; videoUrl: string | null; equipment: string[]; muscleGroups: string[]; primary_muscles: string[]; secondary_muscles: string[]; uses: number }[]
  >`
    SELECT l.id, l.name, l."videoUrl", l.equipment, l."muscleGroups", l.primary_muscles, l.secondary_muscles,
           COALESCE(u.n, 0)::int AS uses
    FROM "ExerciseLibrary" l
    LEFT JOIN (
      SELECT "exerciseId", COUNT(*) AS n FROM "WorkoutExercise" WHERE "exerciseId" IS NOT NULL GROUP BY "exerciseId"
    ) u ON u."exerciseId" = l.id
    WHERE l."videoUrl" IS NOT NULL
      AND (l.primary_muscles && ${primary}::text[] OR l."muscleGroups" && ${patterns}::text[])
    ORDER BY (SELECT COUNT(*) FROM unnest(l.primary_muscles) m WHERE m = ANY(${primary}::text[])) DESC,
             (l."muscleGroups" && ${patterns}::text[]) DESC,
             COALESCE(u.n, 0) DESC,
             length(l.name)
    LIMIT 120`
  const uses = new Map(found.map((r) => [r.id, r.uses]))
  const candidates = found.map((r) => toSwapRow({ ...r, primaryMuscles: r.primary_muscles, secondaryMuscles: r.secondary_muscles }))

  const suggestions = rankSwaps({ name, id: row.exerciseId, patterns, primary, secondary }, candidates, uses)
  return NextResponse.json({ suggestions })
}

async function handlePATCH(req: Request, { params }: { params: { id: string; rowId: string } }) {
  const who = await load(params.id, params.rowId)
  if (!who) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const row = who.row
  const body = (await req.json().catch(() => ({}))) as { exerciseId?: string | null; name?: string }
  const lib = body.exerciseId
    ? await prisma.exerciseLibrary.findUnique({ where: { id: body.exerciseId }, select: { id: true, name: true, videoUrl: true, tracking: true } })
    : null
  // A client picks from the library, so every swap they make has a demo video.
  if (who.by === "client" && !lib) return NextResponse.json({ error: "Pick an exercise from the list" }, { status: 400 })
  const name = (lib?.name ?? body.name ?? "").trim().slice(0, 120)
  if (!name) return NextResponse.json({ error: "Pick an exercise" }, { status: 400 })
  const was = row.name ?? row.exercise?.name ?? "an exercise"

  // Same dose, new movement: the prescription, sets, reps and rest stay; the cue was for the
  // old movement, and so were any sets logged on it, so both go.
  await prisma.$transaction([
    prisma.exerciseLog.deleteMany({ where: { workoutExerciseId: row.id } }),
    prisma.workoutExercise.update({ where: { id: row.id }, data: { exerciseId: lib?.id ?? null, name, notes: null } }),
  ])
  if (who.by === "client") {
    const note = `Swapped ${was} for ${name}.`
    await prisma.workoutComment.create({ data: { workoutId: row.workout.id, authorId: row.workout.clientId!, authorName: who.name, body: note } })
    const coaches = await prisma.clientCoach.findMany({ where: { clientId: row.workout.clientId!, status: "ACTIVE" }, select: { coachId: true } })
    await Promise.all(
      coaches.map((c) =>
        notifyUser(c.coachId, {
          title: `${who.name.split(" ")[0]} swapped an exercise`,
          body: `${row.workout.name}: ${note}`,
          url: `/coach/clients/${row.workout.clientId}/workouts/${row.workout.id}`,
          tag: `workout-${row.workout.id}`,
        })
      )
    )
  }
  const lastTimes = await getLastTimes(row.workout.clientId!, row.workout.id, [{ id: row.id, exerciseId: lib?.id ?? null, name }])
  return NextResponse.json({
    id: row.id,
    exerciseId: lib?.id ?? null,
    name,
    videoUrl: lib?.videoUrl ?? null,
    libraryTracking: lib?.tracking ?? null,
    lastTime: lastTimes[row.id] ?? null,
  })
}

export const GET = withAlert("workouts/exercise/suggest", handleGET)
export const PATCH = withAlert("workouts/exercise/swap", handlePATCH)
