import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"

/**
 * The workout screen's frame: a back button big enough to hit, leaving saves
 * what was just logged, Finish waits at the end instead of covering the
 * session, and the client's text size from Settings.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })
const NAME = "UX Session"

let workoutId = ""
let squatId = ""
let clientId = ""

test.beforeAll(async () => {
  clientId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })).id
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { tourSeenAt: new Date() } })
  await prisma.workout.deleteMany({ where: { clientId, name: NAME } })
  const today = new Date(new Date().toISOString().slice(0, 10) + "T12:00:00.000Z")
  const w = await prisma.workout.create({
    data: {
      clientId,
      name: NAME,
      scheduledDate: today,
      dayOfWeek: today.getUTCDay(),
      order: 1,
      exercises: {
        create: [
          { name: "Back Squat", prescription: "3 x 5", sets: 3, order: 1 },
          // A tempo cue, not a hold: this used to become a 5 second timer.
          { name: "Pull-Up", prescription: "4x1 with 5 s lower, rest 90 s", reps: "1", sets: 4, order: 2 },
          { name: "Bench Press", prescription: "3 x 5", sets: 3, order: 3 },
          { name: "Row", prescription: "3 x 10", sets: 3, order: 4 },
        ],
      },
    },
    include: { exercises: { orderBy: { order: "asc" } } },
  })
  workoutId = w.id
  squatId = w.exercises[0].id
})

test.afterAll(async () => {
  await prisma.workout.deleteMany({ where: { clientId, name: NAME } })
  await prisma.$disconnect()
})

async function signIn(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

test("tapping back right after ticking a set still saves it", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signIn(page)
  await prisma.exerciseLog.deleteMany({ where: { workoutExerciseId: squatId } })
  await page.goto(`/client/workouts/${workoutId}`)

  await page.getByRole("textbox", { name: "Set 1 weight" }).fill("135")
  await page.getByRole("button", { name: "Set 1 done" }).click()
  // Straight out, well inside the one-second autosave wait.
  const back = page.getByTestId("workout-back")
  const box = await back.boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
  await back.click()
  await page.waitForURL(/\/client$/)

  await expect
    .poll(async () => (await prisma.setLog.findMany({ where: { exerciseLog: { workoutExerciseId: squatId } } })).map((s) => [s.weight, s.isCompleted]), { timeout: 10_000 })
    .toContainEqual([135, true])
  await ctx.close()
})

test("Finish sits at the end of the session, not pinned over it", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 700 } })
  const page = await ctx.newPage()
  await signIn(page)
  await page.goto(`/client/workouts/${workoutId}`)

  const finish = page.getByRole("button", { name: "Finish workout" })
  await expect(finish).toHaveCount(1)
  // Nothing fixed holds it, and on a fresh screen it is below the fold.
  expect(await finish.evaluate((el) => { for (let n: Element | null = el; n; n = n.parentElement) if (getComputedStyle(n).position === "fixed") return true; return false })).toBe(false)
  await expect(finish).not.toBeInViewport()

  // The last exercise points the way to it.
  await page.getByRole("button", { name: /Row/ }).first().click()
  await page.getByRole("button", { name: /Finish below/ }).click()
  await expect(finish).toBeInViewport()
  await ctx.close()
})

test("a rep with a tempo cue logs reps with a tick, not a hold timer", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signIn(page)
  await page.goto(`/client/workouts/${workoutId}`)
  // Open it unless it already is (it opens on its own once the squat before it is logged).
  const pull = page.locator('button[aria-expanded]', { hasText: "Pull-Up" })
  if ((await pull.getAttribute("aria-expanded")) !== "true") await pull.click()
  await expect(page.getByRole("textbox", { name: "Set 1 reps" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Start set 1" })).toHaveCount(0)
  await ctx.close()
})

test("text size: picked in Settings, applied across the app, kept after a reload", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signIn(page)
  const rootPx = () => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)
  // A notch above the original 16px out of the box.
  await expect.poll(rootPx).toBe("17px")

  await page.goto("/client/profile")
  await page.getByRole("radio", { name: /Extra large/ }).click()
  await expect.poll(rootPx).toBe("21px")

  await page.goto(`/client/workouts/${workoutId}`)
  await expect.poll(rootPx).toBe("21px")
  // Nothing on the workout screen runs off the side of a small phone at the biggest size.
  await page.setViewportSize({ width: 352, height: 689 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(352)

  await page.goto("/client/profile")
  await page.getByRole("radio", { name: "Small", exact: true }).click()
  await page.reload()
  await expect.poll(rootPx).toBe("16px")
  await ctx.close()
})
