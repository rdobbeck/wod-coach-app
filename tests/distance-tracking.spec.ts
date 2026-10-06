import { test, expect, devices, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"
import { exerciseKey } from "../lib/exercise-key"

/**
 * "3x30m" on a carry is 30 meters, not 30 minutes: weight × meters, a plain
 * tick that starts rest, no hold timer. Reps and real holds are unchanged.
 * Runs at phone size.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })
const NAME = "Carry Session"
const PAST = "Carry Session (last week)"

let workoutId = ""
let clientId = ""
let carryId = ""
let cleanId = ""

test.beforeAll(async () => {
  const client = await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })
  clientId = client.id
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { tourSeenAt: new Date(), units: "lb" } })
  await prisma.workout.deleteMany({ where: { clientId, name: { in: [NAME, PAST] } } })
  // Linked to the library's Farmer Carry when this database has one, as in production.
  const farmer = await prisma.exerciseLibrary.findFirst({ where: { name: "Farmer Carry" }, select: { id: true } })

  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z")
  const lastWeek = new Date(today.getTime() - 7 * 86_400_000)

  // Last week: 90 lb × 30 m for three sets, saved in the reps column.
  const past = await prisma.workout.create({
    data: {
      clientId, name: PAST, scheduledDate: lastWeek, dayOfWeek: lastWeek.getUTCDay(), order: 1, isCompleted: true,
      exercises: { create: [{ name: "Farmer Carry", exerciseId: farmer?.id, prescription: "3x30m @ RPE 7, rest 60-90s", reps: "30m", sets: 3, order: 1 }] },
    },
    include: { exercises: true },
  })
  const log = await prisma.workoutLog.create({ data: { workoutId: past.id, userId: clientId, completedAt: lastWeek } })
  await prisma.exerciseLog.create({
    data: {
      workoutLogId: log.id, workoutExerciseId: past.exercises[0].id, userId: clientId, exerciseId: farmer?.id, exerciseKey: exerciseKey("Farmer Carry"), performedAt: lastWeek,
      setLogs: { create: [1, 2, 3].map((n) => ({ workoutLogId: log.id, workoutExerciseId: past.exercises[0].id, setNumber: n, weight: 90, reps: 30 })) },
    },
  })

  const workout = await prisma.workout.create({
    data: {
      clientId, name: NAME, scheduledDate: today, dayOfWeek: today.getUTCDay(), order: 1,
      exercises: {
        create: [
          { name: "Farmer Carry", exerciseId: farmer?.id, prescription: "3x30m @ RPE 7.5, rest 60-90s", reps: "30m", sets: 3, supersetGroup: "A", notes: "Tall posture, crush the handles, short quick steps.", order: 1 },
          { name: "Power Clean", prescription: "5x3 @ 75%, rest 2 min", reps: "3", sets: 5, order: 2 },
          { name: "Active Hang", prescription: "3 x 20s, rest 60s", reps: "20s", sets: 3, order: 3 },
        ],
      },
    },
    include: { exercises: { orderBy: { order: "asc" } } },
  })
  workoutId = workout.id
  carryId = workout.exercises[0].id
  cleanId = workout.exercises[1].id
})

test.afterAll(async () => {
  await prisma.workout.deleteMany({ where: { clientId, name: { in: [NAME, PAST] } } })
  await prisma.$disconnect()
})

async function openWorkout(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
  await page.clock.install()
  await page.goto(`/client/workouts/${workoutId}`)
}

const loggedSets = (exerciseId: string) =>
  prisma.setLog.findMany({ where: { workoutExerciseId: exerciseId }, orderBy: { setNumber: "asc" }, select: { reps: true, weight: true, isCompleted: true } })

test("a carry in meters logs weight × meters; reps and holds are unchanged", async ({ browser }) => {
  test.setTimeout(90_000)
  const ctx = await browser.newContext({ ...devices["Pixel 7"], storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await openWorkout(page)
  await page.clock.pauseAt(Date.now() + 1_000)

  // Farmer Carry: meters, not a 30 minute hold.
  await expect(page.getByText("Rest 1:30", { exact: true })).toBeVisible()
  await expect(page.getByText(/Hold/)).toHaveCount(0)
  await expect(page.getByRole("button", { name: /Last time/ })).toContainText("90 lb × 30 m (×3)")
  await expect(page.getByText("m", { exact: true })).toBeVisible()
  await expect(page.getByText("Sec", { exact: true })).toHaveCount(0)
  for (const n of [1, 2, 3]) await expect(page.getByRole("textbox", { name: `Set ${n} distance` })).toHaveValue("30")
  await page.screenshot({ path: "test-results/distance-carry-phone.png", fullPage: true })

  // The set button ticks the set and starts rest, like any other set.
  await expect(page.getByRole("button", { name: "Start set 1" })).toHaveCount(0)
  await page.getByRole("button", { name: "Set 1 done" }).click()
  await expect(page.getByRole("button", { name: "Set 1 done" })).toHaveAttribute("aria-pressed", "true")
  const timer = page.getByRole("timer")
  await expect(timer).toContainText("Rest")
  await expect(timer).toContainText("1:30")
  await page.clock.runFor(1_500)
  await expect.poll(async () => (await loggedSets(carryId))[0], { timeout: 10_000 }).toEqual({ reps: 30, weight: 90, isCompleted: true })

  // Power Clean still logs reps.
  await page.locator("button[aria-expanded]").filter({ hasText: "Power Clean" }).click()
  await expect(page.getByText("Reps", { exact: true })).toBeVisible()
  await expect(page.getByText("Rest 2:00", { exact: true })).toBeVisible()
  await page.getByRole("textbox", { name: "Set 1 reps" }).fill("3")
  await page.getByRole("button", { name: "Set 1 done" }).click()
  await page.clock.runFor(1_500)
  await expect.poll(async () => (await loggedSets(cleanId))[0]?.reps, { timeout: 10_000 }).toBe(3)

  // Active Hang still runs a 20 s hold.
  await page.locator("button[aria-expanded]").filter({ hasText: "Active Hang" }).click()
  await expect(page.getByText("Hold 0:20 · Rest 1:00")).toBeVisible()
  await expect(page.getByText("Sec", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Start set 1" }).click()
  await expect(timer).toContainText("0:20")
  await page.clock.runFor(20_000)
  await expect(page.getByRole("textbox", { name: "Set 1 seconds" })).toHaveValue("20")

  await ctx.close()
})
