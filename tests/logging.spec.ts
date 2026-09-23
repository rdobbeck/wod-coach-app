import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"

/**
 * Logging a set carries its numbers to the next set, and the app shows what to
 * do next: a pulse for "act here", accent red for "move on".
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })

let workoutId = ""
let clientId = ""

test.beforeAll(async () => {
  const client = await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })
  clientId = client.id
  await prisma.workout.deleteMany({ where: { clientId, name: "Logging Session" } })
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z")
  const workout = await prisma.workout.create({
    data: {
      clientId,
      name: "Logging Session",
      scheduledDate: today,
      dayOfWeek: today.getUTCDay(),
      order: 1,
      exercises: {
        create: [
          { name: "Back Squat", prescription: "3 x 5", order: 1 },
          { name: "Bench Press", prescription: "3 x 5", order: 2 },
        ],
      },
    },
  })
  workoutId = workout.id
})

test.afterAll(async () => {
  await prisma.workout.deleteMany({ where: { clientId, name: "Logging Session" } })
  await prisma.$disconnect()
})

async function openWorkout(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
  await page.goto(`/client/workouts/${workoutId}`)
}

test("ticking a set carries its weight and reps to the next set", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await openWorkout(page)

  // "Log sets" invites the tap, so it carries the pulse.
  const logSets = page.getByRole("button", { name: /Log sets/ })
  await expect(logSets).toHaveClass(/pulse-cta/)
  await logSets.click()

  const weight1 = page.getByRole("textbox", { name: "Set 1 weight" })
  const reps1 = page.getByRole("textbox", { name: "Set 1 reps" })
  await weight1.fill("135")
  await reps1.fill("5")

  // Set 2 is still empty before the tick.
  await expect(page.getByRole("textbox", { name: "Set 2 weight" })).toHaveValue("")

  // The first unticked set is what to do next, so that box pulses.
  const done1 = page.getByRole("button", { name: "Set 1 done" })
  await expect(done1).toHaveClass(/pulse-cta/)
  await done1.click()

  // Now set 2 is pre-filled with the same numbers, ready to bump.
  await expect(page.getByRole("textbox", { name: "Set 2 weight" })).toHaveValue("135")
  await expect(page.getByRole("textbox", { name: "Set 2 reps" })).toHaveValue("5")

  // And the pulse has moved down to set 2.
  await expect(done1).not.toHaveClass(/pulse-cta/)
  await expect(page.getByRole("button", { name: "Set 2 done" })).toHaveClass(/pulse-cta/)

  // Two taps on + is 145, the point of carrying the number down.
  await page.getByRole("button", { name: "Set 2 weight up" }).click()
  await page.getByRole("button", { name: "Set 2 weight up" }).click()
  await expect(page.getByRole("textbox", { name: "Set 2 weight" })).toHaveValue("145")

  await ctx.close()
})

test("a set the client already filled in is never overwritten", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await openWorkout(page)

  await page.getByRole("button", { name: /Log sets/ }).click()
  await page.getByRole("textbox", { name: "Set 1 weight" }).fill("135")
  await page.getByRole("textbox", { name: "Set 2 weight" }).fill("185")
  await page.getByRole("button", { name: "Set 1 done" }).click()

  await expect(page.getByRole("textbox", { name: "Set 2 weight" })).toHaveValue("185")
  await ctx.close()
})

test("moving on is red, not another grey button", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await openWorkout(page)

  const next = page.getByRole("button", { name: /^Next: Bench Press$/ })
  await expect(next).toHaveClass(/bg-app-accent/)
  await ctx.close()
})
