import { test, expect } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"
import { aiToday } from "../lib/ai/assist"
import { autoCompleteLoggedSessions } from "../lib/auto-complete"

/**
 * The morning sweep: a session from an earlier day with work logged (a ticked
 * set, a result note or an RPE) is marked complete as if Finish was tapped;
 * anything untouched, from today, or older than a week is left alone.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })
const PREFIX = "AutoC "
let clientId = ""

const day = (offset: number) => {
  const d = new Date(`${aiToday()}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return d
}

async function session(name: string, offset: number, log?: { ticked?: boolean; typedOnly?: boolean; note?: string; rpe?: number }) {
  const when = day(offset)
  const w = await prisma.workout.create({
    data: {
      clientId, name: `${PREFIX}${name}`, scheduledDate: when, dayOfWeek: when.getUTCDay(), order: 1,
      exercises: { create: [{ name: "Back Squat", prescription: "3 x 5", order: 1 }] },
    },
    include: { exercises: true },
  })
  if (log) {
    const wl = await prisma.workoutLog.create({ data: { workoutId: w.id, userId: clientId } })
    const xl = await prisma.exerciseLog.create({
      data: { workoutLogId: wl.id, workoutExerciseId: w.exercises[0].id, userId: clientId, exerciseKey: "back squat", performedAt: when, resultText: log.note ?? null, rpe: log.rpe ?? null },
    })
    if (log.ticked || log.typedOnly) {
      await prisma.setLog.create({ data: { workoutLogId: wl.id, workoutExerciseId: w.exercises[0].id, exerciseLogId: xl.id, setNumber: 1, weight: 135, reps: 5, isCompleted: !!log.ticked } })
    }
  }
  return w.id
}

const done = async (id: string) => (await prisma.workout.findUniqueOrThrow({ where: { id } })).isCompleted

test.beforeAll(async () => {
  clientId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })).id
  await prisma.workout.deleteMany({ where: { clientId, name: { startsWith: PREFIX } } })
})
test.afterAll(async () => {
  await prisma.workout.deleteMany({ where: { clientId, name: { startsWith: PREFIX } } })
  await prisma.$disconnect()
})

test("only earlier sessions with work logged are completed", async () => {
  const ticked = await session("Ticked", -1, { ticked: true })
  const noted = await session("Note only", -2, { note: "Felt good, 3x5 at 135" })
  const rated = await session("RPE only", -3, { rpe: 8 })
  const typed = await session("Typed, never ticked", -1, { typedOnly: true })
  const untouched = await session("Untouched", -1)
  const today = await session("Today", 0, { ticked: true })
  const old = await session("Two weeks ago", -14, { ticked: true })

  const lastLogged = (await prisma.workoutLog.findFirstOrThrow({ where: { workoutId: ticked } })).updatedAt
  await autoCompleteLoggedSessions()

  expect(await done(ticked)).toBe(true)
  expect(await done(noted)).toBe(true)
  expect(await done(rated)).toBe(true)
  expect(await done(typed)).toBe(false)
  expect(await done(untouched)).toBe(false)
  expect(await done(today)).toBe(false)
  expect(await done(old)).toBe(false)

  // Completed when the client last logged, not when the sweep ran.
  const log = await prisma.workoutLog.findFirstOrThrow({ where: { workoutId: ticked } })
  expect(log.completedAt.getTime()).toBe(lastLogged.getTime())

  // Running again changes nothing.
  const again = await autoCompleteLoggedSessions()
  expect(again.completed.filter((id) => [ticked, noted, rated].includes(id))).toEqual([])
})

test("the cron route needs the cron secret", async ({ request }) => {
  const res = await request.get("/api/cron/auto-complete", { headers: { authorization: "Bearer wrong" } })
  expect(res.status()).toBe(401)
})
