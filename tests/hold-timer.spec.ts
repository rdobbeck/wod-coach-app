import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"

/**
 * Timed exercises get a timer, and rest matches what the coach wrote.
 * The browser clock is faked so a 20 second plank takes no real time.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })
const NAME = "Hold Session"

let workoutId = ""
let clientId = ""
let plankId = ""
let hangId = ""

test.beforeAll(async () => {
  const client = await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })
  clientId = client.id
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { tourSeenAt: new Date() } })
  await prisma.workout.deleteMany({ where: { clientId, name: NAME } })
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z")
  const workout = await prisma.workout.create({
    data: {
      clientId,
      name: NAME,
      scheduledDate: today,
      dayOfWeek: today.getUTCDay(),
      order: 1,
      exercises: {
        create: [
          { name: "Plank", prescription: "3 x 20s, rest 1:30", sets: 3, reps: "20s", order: 1 },
          { name: "Dead Hang", prescription: "2 x max hold, rest 60s", sets: 2, order: 2 },
          // Rest only in the coach's rest field, not the text.
          { name: "Curl", prescription: "3x10", sets: 3, reps: "10", restSeconds: 75, order: 3 },
        ],
      },
    },
    include: { exercises: { orderBy: { order: "asc" } } },
  })
  workoutId = workout.id
  plankId = workout.exercises[0].id
  hangId = workout.exercises[1].id
})

test.afterAll(async () => {
  await prisma.workout.deleteMany({ where: { clientId, name: NAME } })
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
  prisma.setLog.findMany({ where: { workoutExerciseId: exerciseId }, orderBy: { setNumber: "asc" }, select: { reps: true, isCompleted: true } })

test("a prescribed hold counts down, logs the seconds, and starts the prescribed rest", async ({ browser }) => {
  test.setTimeout(90_000)
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await openWorkout(page)

  // The plank is open first; it says up front what the timers will do.
  await expect(page.getByText("Hold 0:20 · Rest 1:30")).toBeVisible()
  // From here time only moves when the test says so, so the clocks are exact.
  await page.clock.pauseAt(Date.now() + 1_000)
  // Three planned sets, so the rows are already there, seeded with the prescribed 20s.
  await expect(page.getByText("Sec", { exact: true })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Set 1 seconds" })).toHaveValue("20")

  await page.getByRole("button", { name: "Start set 1" }).click()
  const timer = page.getByRole("timer")
  await expect(timer).toContainText("0:20")
  await page.clock.runFor(5_000)
  await expect(timer).toContainText("0:15")

  // Reaching the target (5s + 15s) ticks the set with the full 20s and rest starts at 1:30, as written.
  await page.clock.runFor(15_000)
  await expect(page.getByRole("button", { name: "Set 1 done" })).toHaveAttribute("aria-pressed", "true")
  await expect(timer).toContainText("Rest")
  await expect(timer).toContainText("1:30")
  await expect(page.getByRole("textbox", { name: "Set 2 seconds" })).toHaveValue("20")

  // Autosave is a second behind; the seconds land in the reps column.
  await page.clock.runFor(1_500)
  await expect.poll(async () => (await loggedSets(plankId))[0], { timeout: 10_000 }).toEqual({ reps: 20, isCompleted: true })

  // Max hold: count up, Stop logs what they got.
  // The exercise header (it toggles open), not the plank's "Next: Dead Hang" button.
  await page.locator("button[aria-expanded]").filter({ hasText: "Dead Hang" }).click()
  await expect(page.getByText("Hold as long as you can · Rest 1:00")).toBeVisible()
  await page.getByRole("button", { name: "Start set 1" }).click()
  await expect(timer).toContainText("max hold")
  await page.clock.runFor(12_000)
  await expect(timer).toContainText("0:12")
  await page.getByRole("button", { name: "Stop hold" }).click()
  await expect(page.getByRole("textbox", { name: "Set 1 seconds" })).toHaveValue("12")
  await expect(timer).toContainText("1:00")
  await page.clock.runFor(1_500)
  await expect.poll(async () => (await loggedSets(hangId))[0], { timeout: 10_000 }).toEqual({ reps: 12, isCompleted: true })

  // Rest from the coach's rest field when the text says nothing.
  await page.locator("button[aria-expanded]").filter({ hasText: "Curl" }).click()
  await expect(page.getByText("Rest 1:15")).toBeVisible()

  await ctx.close()
})
