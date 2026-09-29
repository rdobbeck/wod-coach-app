import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"
import { fromDayKey } from "../lib/training"

/**
 * Train mode: the coach runs a client's session from their own account, on the
 * same screen the client would use, and everything logged lands under the
 * client's record.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })

const NAME = "Train Mode Session"
let clientId = ""
let clientName = ""
let workoutId = ""

const local = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

test.beforeAll(async () => {
  const client = await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })
  clientId = client.id
  clientName = client.name ?? ""
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { tourSeenAt: new Date() } })
  await prisma.workout.deleteMany({ where: { clientId, name: NAME } })
  const today = fromDayKey(local())
  const workout = await prisma.workout.create({
    data: {
      clientId,
      name: NAME,
      scheduledDate: today,
      dayOfWeek: today.getUTCDay(),
      order: 1,
      exercises: { create: [{ name: "Back Squat", prescription: "3 x 5, rest 2 min", order: 1 }] },
    },
  })
  workoutId = workout.id
})

test.afterAll(async () => {
  await prisma.workout.deleteMany({ where: { clientId, name: NAME } })
  await prisma.$disconnect()
})

const trainUrl = () => `/coach/clients/${clientId}/workouts/${workoutId}/train`

async function signInAsClient(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

test("Train buttons open the session from the client's page and the workout page", async ({ page }) => {
  await page.goto(`/coach/clients/${clientId}`)
  await page.getByRole("link", { name: "Train today" }).click()
  await expect(page).toHaveURL(new RegExp(`${workoutId}/train$`))

  await page.goto(`/coach/clients/${clientId}/workouts/${workoutId}`)
  await page.getByRole("link", { name: "Train", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${workoutId}/train$`))
})

test("a coach logs a set for their client; it is the client's log, and the rest timer runs", async ({ page, browser }) => {
  test.setTimeout(60_000)
  await page.goto(trainUrl())
  await expect(page.getByText(`Coaching ${clientName}`)).toBeVisible()

  await page.getByRole("button", { name: /Log sets/ }).click()
  await page.getByRole("textbox", { name: "Set 1 weight" }).fill("135")
  await page.getByRole("textbox", { name: "Set 1 reps" }).fill("5")
  await page.getByRole("button", { name: "Set 1 done" }).click()

  // Rest from the prescription, counting down on the coach's phone.
  const timer = page.getByRole("timer")
  await expect(timer).toContainText("Rest")
  await expect(timer).toContainText("2:00")

  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 })

  // Stored under the client, not the coach.
  const logs = await prisma.workoutLog.findMany({ where: { workoutId }, include: { setLogs: true } })
  expect(logs).toHaveLength(1)
  expect(logs[0].userId).toBe(clientId)
  expect(logs[0].setLogs[0]).toMatchObject({ setNumber: 1, weight: 135, reps: 5, isCompleted: true })

  // Finish returns the coach to their own view of the workout, not the client app.
  await page.getByRole("button", { name: "Finish workout" }).click()
  await expect(page).toHaveURL(new RegExp(`/coach/clients/${clientId}/workouts/${workoutId}$`))

  // The client sees exactly what was logged for them.
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const clientPage = await ctx.newPage()
  await signInAsClient(clientPage)
  await clientPage.goto(`/client/workouts/${workoutId}`)
  await expect(clientPage.getByRole("textbox", { name: "Set 1 weight" })).toHaveValue("135")
  await expect(clientPage.getByRole("button", { name: "Set 1 done" })).toHaveAttribute("aria-pressed", "true")
  await ctx.close()
})

test("a coach who does not coach the client cannot open train mode", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  const email = "playwright-other-coach@dev.local"
  await page.request.post(`${baseURL}/api/auth/signup`, {
    data: { name: "Other Coach", email, password: "playwright-test-PW-1", role: "COACH", startedAt: Date.now() - 5_000 },
    failOnStatusCode: false,
  })
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/coach$/, { timeout: 15_000 })

  const res = await page.goto(trainUrl())
  expect(res?.status()).toBe(404)
  await ctx.close()
})
