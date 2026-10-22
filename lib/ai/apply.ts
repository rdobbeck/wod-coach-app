import { prisma } from "@/lib/prisma"
import { MAX_MERGED_CHANGES, aiToday } from "@/lib/ai/assist"
import { noLongDashes } from "@/lib/text"
import { dayKey, fromDayKey } from "@/lib/training-format"

/**
 * Writing AI-proposed edits, and taking them back.
 *
 * Nothing the browser sends is trusted: every change is checked again here
 * against the database. A change is skipped (and reported) if the session is
 * not this client's, is already done or in the past, or the exercise has any
 * logged sets. Deleting an exercise with logs would cascade away real history,
 * so those are never touched, and neither is a whole session with any logs or
 * comments. A client applying edits to their own training may move sessions
 * only when their coach lets them, and may never delete one.
 */
export type ChangeInput = {
  action: "replace" | "modify" | "remove" | "add" | "link" | "create" | "move" | "delete"
  workoutId: string
  exerciseId?: string
  newExercise?: string
  newPrescription?: string
  libraryId?: string | null
  // "create" only: a new standalone session on `date` named `workoutName` with these exercises in order.
  date?: string
  workoutName?: string
  exercises?: { name?: string; prescription?: string; libraryId?: string | null }[]
  newDate?: string // "move" only
  position?: "start" // "add" only: first instead of last
}
const MAX_CREATE_EXERCISES = 20

type Row = {
  exerciseId: string | null
  name: string | null
  prescription: string | null
  supersetGroup: string | null
  order: number
  sets: number | null
  reps: string | null
  weight: number | null
  restSeconds: number | null
  tempo: string | null
  notes: string | null
  coachrxItemId: string | null
}
const ROW = {
  exerciseId: true, name: true, prescription: true, supersetGroup: true, order: true,
  sets: true, reps: true, weight: true, restSeconds: true, tempo: true, notes: true, coachrxItemId: true,
} as const

type Applied =
  | { action: "replace" | "modify" | "link"; workoutId: string; exerciseId: string; before: Row }
  | { action: "remove"; workoutId: string; exerciseId: string; before: Row }
  | { action: "add"; workoutId: string; exerciseId: string }
  | { action: "create"; workoutId: string }
  | { action: "move"; workoutId: string; before: MoveState }
  | { action: "delete"; workoutId: string; snapshot: WorkoutSnapshot }

type MoveState = { scheduledDate: Date; dayOfWeek: number; order: number; originalDate: Date | null; movedAt: Date | null; movedById: string | null }
// A deleted session in full, so undo can put it back with the same ids.
type WorkoutSnapshot = Record<string, unknown> & { exercises: (Row & { id: string })[] }

const clean = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? noLongDashes(v.trim()).slice(0, max) : undefined)

export async function applyChanges(coachId: string, clientId: string, request: string, changes: ChangeInput[], appliedById: string) {
  const today = aiToday()
  const todayStart = new Date(`${today}T00:00:00.000Z`)
  const skipped: string[] = []
  const applied: Applied[] = []
  const byClient = appliedById === clientId
  const canMove = byClient
    ? (await prisma.clientProfile.findUnique({ where: { userId: clientId }, select: { canMoveWorkouts: true } }))?.canMoveWorkouts ?? true
    : true
  const firsts = new Map<string, { base: number; n: number }>()

  await prisma.$transaction(
    async (tx) => {
      for (const c of changes.slice(0, MAX_MERGED_CHANGES)) {
        if (c.action === "create") {
          const name = clean(c.workoutName, 120)
          const date = typeof c.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? c.date : null
          if (!name || !date) {
            skipped.push("A new session was missing its name or date.")
            continue
          }
          if (date < today) {
            skipped.push(`A new session on ${date} is in the past, so it was left out.`)
            continue
          }
          const rows: { name: string; prescription: string; libraryId: string | null }[] = []
          for (const x of (Array.isArray(c.exercises) ? c.exercises : []).slice(0, MAX_CREATE_EXERCISES)) {
            const n = clean(x?.name, 120)
            const rx = clean(x?.prescription, 300)
            if (n && rx) rows.push({ name: n, prescription: rx, libraryId: typeof x?.libraryId === "string" ? x.libraryId : null })
          }
          if (!rows.length) {
            skipped.push(`A new session (${name}) had no complete exercises.`)
            continue
          }
          const libIds = Array.from(new Set(rows.map((r) => r.libraryId).filter((id): id is string => !!id)))
          const libs = libIds.length ? await tx.exerciseLibrary.findMany({ where: { id: { in: libIds } }, select: { id: true } }) : []
          const known = new Set(libs.map((l) => l.id))
          // Noon UTC, the app-wide convention (fromDayKey), so the day never shifts in any time zone.
          const day = fromDayKey(date)
          const count = await tx.workout.count({ where: { clientId, scheduledDate: day } })
          const made = await tx.workout.create({
            data: {
              clientId,
              name,
              scheduledDate: day,
              dayOfWeek: day.getUTCDay(),
              order: count + 1,
              exercises: { create: rows.map((r, i) => ({ name: r.name, prescription: r.prescription, exerciseId: r.libraryId && known.has(r.libraryId) ? r.libraryId : null, order: i + 1 })) },
            },
            select: { id: true },
          })
          applied.push({ action: "create", workoutId: made.id })
          continue
        }
        const w = await tx.workout.findFirst({
          where: { id: c.workoutId, clientId, isCompleted: false, scheduledDate: { gte: todayStart } },
          select: { id: true, name: true, scheduledDate: true, dayOfWeek: true, order: true, originalDate: true, movedAt: true, movedById: true },
        })
        if (!w) {
          skipped.push("A session was not found, is already done, or is in the past.")
          continue
        }

        if (c.action === "move") {
          const date = typeof c.newDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.newDate) ? c.newDate : null
          if (!date || date < today) {
            skipped.push(`${w.name} needs a new date from today on.`)
            continue
          }
          if (!canMove) {
            skipped.push("Your coach has turned off moving workouts.")
            continue
          }
          if (date === dayKey(w.scheduledDate)) continue
          const target = fromDayKey(date)
          const sameDay = await tx.workout.count({ where: { clientId, scheduledDate: target } })
          const { id: _id, name: _name, ...before } = w
          void _id, _name
          // Same bookkeeping as moving it by hand, so "moved from" shows on the calendar.
          await tx.workout.update({
            where: { id: w.id },
            data: { scheduledDate: target, dayOfWeek: target.getUTCDay(), order: sameDay + 1, originalDate: w.originalDate ?? w.scheduledDate, movedAt: new Date(), movedById: appliedById },
          })
          applied.push({ action: "move", workoutId: w.id, before })
          continue
        }

        if (c.action === "delete") {
          if (byClient) {
            skipped.push("Only your coach can cancel a session.")
            continue
          }
          const full = await tx.workout.findUnique({
            where: { id: w.id },
            include: { exercises: { select: { id: true, ...ROW, _count: { select: { setLogs: true, exerciseLogs: true } } } }, _count: { select: { logs: true, comments: true } } },
          })
          if (!full) continue
          if (full._count.logs > 0 || full._count.comments > 0 || full.exercises.some((e) => e._count.setLogs > 0 || e._count.exerciseLogs > 0)) {
            skipped.push(`${w.name} has logs or comments, so it was not deleted.`)
            continue
          }
          const { _count, exercises, ...rest } = full
          void _count
          await tx.workout.delete({ where: { id: w.id } })
          applied.push({ action: "delete", workoutId: w.id, snapshot: { ...rest, exercises: exercises.map(({ _count: _c, ...e }) => (void _c, e)) } })
          continue
        }
        const newExercise = clean(c.newExercise, 120)
        const newPrescription = clean(c.newPrescription, 300)

        if (c.action === "add") {
          if (!newExercise || !newPrescription) {
            skipped.push(`An addition to ${w.name} was incomplete.`)
            continue
          }
          const lib = c.libraryId ? await tx.exerciseLibrary.findUnique({ where: { id: c.libraryId }, select: { id: true } }) : null
          let order: number
          if (c.position === "start") {
            // First means ahead of the session's own rows. Several "start" adds in one batch keep the
            // order they came in: each one slots in after the earlier ones, and the rest shift down.
            const slot = firsts.get(w.id) ?? { base: (await tx.workoutExercise.aggregate({ where: { workoutId: w.id }, _min: { order: true } }))._min.order ?? 1, n: 0 }
            order = slot.base + slot.n
            await tx.workoutExercise.updateMany({ where: { workoutId: w.id, order: { gte: order } }, data: { order: { increment: 1 } } })
            firsts.set(w.id, { ...slot, n: slot.n + 1 })
          } else {
            order = ((await tx.workoutExercise.aggregate({ where: { workoutId: w.id }, _max: { order: true } }))._max.order ?? 0) + 1
          }
          const row = await tx.workoutExercise.create({
            data: { workoutId: w.id, name: newExercise, exerciseId: lib?.id ?? null, prescription: newPrescription, order },
            select: { id: true },
          })
          applied.push({ action: "add", workoutId: w.id, exerciseId: row.id })
          continue
        }

        if (!c.exerciseId) {
          skipped.push("A change had no exercise.")
          continue
        }
        const e = await tx.workoutExercise.findFirst({
          where: { id: c.exerciseId, workoutId: w.id },
          select: { ...ROW, _count: { select: { setLogs: true, exerciseLogs: true } } },
        })
        if (!e) {
          skipped.push("An exercise was not found on that session.")
          continue
        }
        if (e._count.setLogs > 0 || e._count.exerciseLogs > 0) {
          skipped.push(`${e.name ?? "An exercise"} already has logged sets, so it was left alone.`)
          continue
        }
        const { _count, ...before } = e
        void _count

        if (c.action === "remove") {
          await tx.workoutExercise.delete({ where: { id: c.exerciseId } })
          applied.push({ action: "remove", workoutId: w.id, exerciseId: c.exerciseId, before })
        } else if (c.action === "link") {
          // Attach the demo video only: the row keeps its name, prescription and numbers.
          const lib = c.libraryId ? await tx.exerciseLibrary.findUnique({ where: { id: c.libraryId }, select: { id: true, videoUrl: true } }) : null
          if (!lib?.videoUrl) {
            skipped.push(`No library video was found for ${e.name ?? "an exercise"}.`)
            continue
          }
          await tx.workoutExercise.update({ where: { id: c.exerciseId }, data: { exerciseId: lib.id } })
          applied.push({ action: "link", workoutId: w.id, exerciseId: c.exerciseId, before })
        } else if (c.action === "modify") {
          if (!newPrescription) {
            skipped.push(`A change to ${e.name ?? "an exercise"} was incomplete.`)
            continue
          }
          await tx.workoutExercise.update({ where: { id: c.exerciseId }, data: { prescription: newPrescription } })
          applied.push({ action: "modify", workoutId: w.id, exerciseId: c.exerciseId, before })
        } else if (c.action === "replace") {
          if (!newExercise) {
            skipped.push(`A change to ${e.name ?? "an exercise"} was incomplete.`)
            continue
          }
          const lib = c.libraryId ? await tx.exerciseLibrary.findUnique({ where: { id: c.libraryId }, select: { id: true } }) : null
          // The old cue and numbers belonged to the old movement, so they go too.
          await tx.workoutExercise.update({
            where: { id: c.exerciseId },
            data: {
              name: newExercise,
              exerciseId: lib?.id ?? null,
              prescription: newPrescription ?? e.prescription,
              notes: null, sets: null, reps: null, weight: null, restSeconds: null, tempo: null,
            },
          })
          applied.push({ action: "replace", workoutId: w.id, exerciseId: c.exerciseId, before })
        } else {
          skipped.push("A change had an unknown action.")
        }
      }
    },
    { timeout: 30_000 }
  )

  if (!applied.length) return { changeSetId: null as string | null, applied: 0, skipped }
  const set = await prisma.aiChangeSet.create({
    data: { coachId, clientId, request: request.slice(0, 2000), applied: applied as never, appliedById },
    select: { id: true },
  })
  return { changeSetId: set.id, applied: applied.length, skipped }
}

/**
 * Put every row in a batch back the way it was. Allowed for the person who
 * applied it and for any coach of that client. Rows the client has logged on
 * since are left as they are.
 */
export async function undoChangeSet(userId: string, changeSetId: string) {
  const set = await prisma.aiChangeSet.findUnique({ where: { id: changeSetId } })
  if (!set) return { ok: false as const, error: "Not found" }
  if (set.appliedById !== userId && set.coachId !== userId) {
    const link = await prisma.clientCoach.findUnique({ where: { clientId_coachId: { clientId: set.clientId, coachId: userId } } })
    if (!link) return { ok: false as const, error: "Not found" }
  }
  if (set.undoneAt) return { ok: false as const, error: "Already undone" }
  const items = set.applied as unknown as Applied[]
  let restored = 0
  const skipped: string[] = []

  await prisma.$transaction(
    async (tx) => {
      for (const a of items) {
        const logged = async (id: string) => {
          const n = await tx.workoutExercise.findUnique({ where: { id }, select: { _count: { select: { setLogs: true, exerciseLogs: true } } } })
          return !!n && (n._count.setLogs > 0 || n._count.exerciseLogs > 0)
        }
        if (a.action === "move") {
          const w = await tx.workout.findUnique({ where: { id: a.workoutId }, select: { isCompleted: true } })
          if (!w) skipped.push("A moved session no longer exists.")
          else if (w.isCompleted) skipped.push("A moved session has since been done, so it stays where it is.")
          else {
            await tx.workout.update({ where: { id: a.workoutId }, data: a.before })
            restored++
          }
          continue
        }
        if (a.action === "delete") {
          const { exercises, ...w } = a.snapshot
          if (await tx.workout.findUnique({ where: { id: a.workoutId }, select: { id: true } })) {
            skipped.push("A deleted session is already back.")
            continue
          }
          await tx.workout.create({ data: { ...(w as object), exercises: { create: exercises } } as never })
          restored++
          continue
        }
        if (a.action === "create") {
          const w = await tx.workout.findUnique({
            where: { id: a.workoutId },
            select: { isCompleted: true, exercises: { select: { _count: { select: { setLogs: true, exerciseLogs: true } } } } },
          })
          if (!w) skipped.push("A created session was already removed.")
          else if (w.isCompleted || w.exercises.some((e) => e._count.setLogs > 0 || e._count.exerciseLogs > 0)) {
            skipped.push("A created session has since been logged, so it stays.")
          } else {
            await tx.workout.delete({ where: { id: a.workoutId } })
            restored++
          }
        } else if (a.action === "add") {
          if (await logged(a.exerciseId)) skipped.push("An added exercise has since been logged, so it stays.")
          else {
            await tx.workoutExercise.deleteMany({ where: { id: a.exerciseId } })
            restored++
          }
        } else if (a.action === "remove") {
          const w = await tx.workout.findUnique({ where: { id: a.workoutId }, select: { id: true } })
          if (!w) skipped.push("A session no longer exists.")
          else {
            await tx.workoutExercise.create({ data: { id: a.exerciseId, workoutId: a.workoutId, ...a.before } })
            restored++
          }
        } else {
          if (await logged(a.exerciseId)) skipped.push("An exercise has since been logged, so it stays as it is.")
          else {
            await tx.workoutExercise.updateMany({ where: { id: a.exerciseId }, data: a.before })
            restored++
          }
        }
      }
      await tx.aiChangeSet.update({ where: { id: set.id }, data: { undoneAt: new Date() } })
    },
    { timeout: 30_000 }
  )
  return { ok: true as const, restored, skipped }
}
