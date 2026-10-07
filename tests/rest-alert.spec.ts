import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"
import { planStep, restAlertUrl } from "../lib/rest-alert"

/**
 * "Rest's up" while the phone is locked: the page arms an alert on its way to
 * the background, the server waits out the rest and sends the push, and
 * coming back (or a newer rest) cancels it. Sending itself is covered by
 * notifyUser; this checks the row's lifecycle, which is what decides whether
 * a push goes out at all.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })
const NAME = "Playwright rest alert"
let clientId = ""
let workoutId = ""

test.beforeAll(async () => {
  const client = await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })
  clientId = client.id
  await prisma.workout.deleteMany({ where: { clientId, name: NAME } })
  const w = await prisma.workout.create({
    data: { clientId, name: NAME, scheduledDate: new Date(), dayOfWeek: new Date().getUTCDay(), order: 9, exercises: { create: [{ name: "Bench Press", order: 1 }] } },
  })
  workoutId = w.id
  await prisma.restAlert.deleteMany({ where: { userId: clientId } })
})

test.afterAll(async () => {
  await prisma.restAlert.deleteMany({ where: { userId: clientId } })
  await prisma.workout.deleteMany({ where: { clientId, name: NAME } })
  await prisma.$disconnect()
})

async function signInAsClient(page: Page) {
  await page.context().clearCookies()
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client/, { timeout: 15_000 })
}

const row = () => prisma.restAlert.findUnique({ where: { userId: clientId } })

test("a hop sleeps at most one hop, then fires on the last stretch", () => {
  expect(planStep(0, 120_000, 50_000)).toEqual({ kind: "hop", sleepMs: 50_000 })
  expect(planStep(100_000, 120_000, 50_000)).toEqual({ kind: "fire", sleepMs: 20_000 })
  expect(planStep(130_000, 120_000, 50_000)).toEqual({ kind: "fire", sleepMs: 0 })
})

test("the notification opens the client's workout, or train mode for the coach who armed it", () => {
  expect(restAlertUrl("c1", { id: "w1", clientId: "c1" })).toBe("/client/workouts/w1")
  expect(restAlertUrl("coach9", { id: "w1", clientId: "c1" })).toBe("/coach/clients/c1/workouts/w1/train")
})

test("arming needs a signed-in user and a workout they can log", async ({ page, playwright, baseURL }) => {
  // The shared request fixture (and a bare newContext) carry the coach's session; this one carries nothing.
  const anonCtx = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
  const anon = await anonCtx.post("/api/rest-alert", { data: { workoutId, exercise: "Bench Press", endsAt: Date.now() + 60_000 } })
  expect(anon.status()).toBe(401)
  await anonCtx.dispose()
  await signInAsClient(page)
  const other = await page.request.post("/api/rest-alert", { data: { workoutId: "nope", exercise: "x", endsAt: Date.now() + 60_000 } })
  expect(other.status()).toBe(404)
  const bad = await page.request.post("/api/rest-alert", { data: { workoutId } })
  expect(bad.status()).toBe(400)
})

test("armed, then the phone comes back: disarmed, nothing fires", async ({ page }) => {
  await signInAsClient(page)
  const res = await page.request.post("/api/rest-alert", { data: { workoutId, exercise: "Bench Press", endsAt: Date.now() + 60_000 } })
  expect(res.status()).toBe(202)
  const armed = await row()
  expect(armed?.workoutId).toBe(workoutId)
  expect(armed?.exercise).toBe("Bench Press")
  const del = await page.request.delete("/api/rest-alert")
  expect(del.ok()).toBeTruthy()
  expect(await row()).toBeNull()
})

test("the rest runs out while locked: the alert fires and clears itself", async ({ page }) => {
  await signInAsClient(page)
  const res = await page.request.post("/api/rest-alert", { data: { workoutId, exercise: "Bench Press", endsAt: Date.now() + 3_000 } })
  expect(res.status()).toBe(202)
  expect(await row()).not.toBeNull()
  await expect.poll(row, { timeout: 15_000, intervals: [500] }).toBeNull()
})

test("a newer rest replaces the old one: only the new time fires", async ({ page }) => {
  await signInAsClient(page)
  await page.request.post("/api/rest-alert", { data: { workoutId, exercise: "Bench Press", endsAt: Date.now() + 120_000 } })
  const first = await row()
  await page.request.post("/api/rest-alert", { data: { workoutId, exercise: "Pull-up", endsAt: Date.now() + 3_000 } })
  const second = await row()
  expect(second?.nonce).not.toBe(first?.nonce)
  expect(second?.exercise).toBe("Pull-up")
  // The short one fires and clears the row; the long chain finds its nonce gone and stops.
  await expect.poll(row, { timeout: 15_000, intervals: [500] }).toBeNull()
  await page.waitForTimeout(1500)
  expect(await row()).toBeNull()
})

test("an end time already in the past disarms instead of arming", async ({ page }) => {
  await signInAsClient(page)
  await page.request.post("/api/rest-alert", { data: { workoutId, exercise: "Bench Press", endsAt: Date.now() + 60_000 } })
  const res = await page.request.post("/api/rest-alert", { data: { workoutId, exercise: "Bench Press", endsAt: Date.now() - 1 } })
  expect((await res.json()).armed).toBe(false)
  expect(await row()).toBeNull()
})

test("the page arms on its way to the background mid-rest and disarms when it comes back", async ({ page }) => {
  await signInAsClient(page)
  await page.goto(`/client/workouts/${workoutId}`)
  const logSets = page.getByRole("button", { name: /^Log sets/ })
  if (await logSets.count()) await logSets.click()
  await page.getByRole("button", { name: "Set 1 done" }).click()
  await expect(page.getByRole("timer")).toContainText("Rest")
  expect(await row()).toBeNull()

  // Pretend the phone locked: the page reads document.visibilityState and listens for the event.
  const setVisibility = (state: "hidden" | "visible") =>
    page.evaluate((s) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => s })
      document.dispatchEvent(new Event("visibilitychange"))
    }, state)
  await setVisibility("hidden")
  await expect.poll(row, { timeout: 10_000 }).not.toBeNull()
  expect((await row())?.exercise).toBe("Bench Press")
  expect((await row())?.fireAt.getTime()).toBeGreaterThan(Date.now() + 30_000)

  await setVisibility("visible")
  await expect.poll(row, { timeout: 10_000 }).toBeNull()

  // Locked again, then Skip on screen after unlocking: nothing left armed.
  await setVisibility("hidden")
  await expect.poll(row, { timeout: 10_000 }).not.toBeNull()
  await setVisibility("visible")
  await page.getByRole("button", { name: "Skip rest" }).click()
  await expect.poll(row, { timeout: 10_000 }).toBeNull()
  // Untick so the workout isn't left half-logged (unticking starts no rest).
  await page.getByRole("button", { name: "Set 1 done" }).click()
  await expect(page.getByRole("button", { name: "Set 1 done" })).toHaveAttribute("aria-pressed", "false")
})
