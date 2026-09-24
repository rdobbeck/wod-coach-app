import { test, expect, type Page, type Locator } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"
import { dayKey, fromDayKey } from "../lib/training"

/**
 * Looking ahead on Today, and moving sessions by dragging them onto a day,
 * from both the coach's calendar and the client's week strip.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })

let clientId = ""
const PREFIX = "Cal "

const local = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const plus = (key: string, n: number) => {
  const d = new Date(`${key}T12:00:00`)
  d.setDate(d.getDate() + n)
  return local(d)
}
const today = local(new Date())
const monday = plus(today, -((new Date(`${today}T12:00:00`).getDay() + 6) % 7))

async function seed(name: string, day: string, done = false) {
  const d = fromDayKey(day)
  return prisma.workout.create({
    data: {
      clientId,
      name,
      scheduledDate: d,
      dayOfWeek: d.getUTCDay(),
      order: 1,
      isCompleted: done,
      exercises: { create: [{ name: "Back Squat", prescription: "3 x 5", order: 1 }] },
    },
  })
}
const dayOf = async (id: string) => dayKey((await prisma.workout.findUniqueOrThrow({ where: { id } })).scheduledDate)

/** A real pointer drag: press, nudge past the threshold, travel, release. */
async function dragTo(page: Page, from: Locator, to: Locator) {
  // The mouse only acts inside the viewport, and the coach calendar sits below the fold.
  await from.scrollIntoViewIfNeeded()
  const a = (await from.boundingBox())!
  const b = (await to.boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + Math.min(a.height / 2, 20))
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + 20, { steps: 3 })
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
  await page.mouse.up()
}

async function signInAsClient(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

test.beforeAll(async () => {
  const client = await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })
  clientId = client.id
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canMoveWorkouts: true, tourSeenAt: new Date() } })
})

test.beforeEach(async () => {
  await prisma.workout.deleteMany({ where: { clientId, name: { startsWith: PREFIX } } })
})

test.afterAll(async () => {
  await prisma.workout.deleteMany({ where: { clientId, name: { startsWith: PREFIX } } })
  await prisma.$disconnect()
})

test("a client can page ahead and open any day's session", async ({ browser }) => {
  const future = plus(monday, 14 + 2) // Wednesday, two weeks out
  await seed(`${PREFIX}Future Session`, future)

  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signInAsClient(page)

  await expect(page.getByText("This week")).toBeVisible()
  await page.getByRole("button", { name: "Next week" }).click()
  await expect(page.getByText("Next week", { exact: true }).first()).toBeVisible()
  await page.getByRole("button", { name: "Next week" }).click()

  await page.locator(`[data-drop-day="${future}"]`).click()
  await expect(page.getByRole("heading", { name: `${PREFIX}Future Session` })).toBeVisible()

  // And straight back.
  await page.getByRole("button", { name: "Back to today" }).click()
  await expect(page.getByText("This week")).toBeVisible()
  await ctx.close()
})

test("a client drags a session onto another day", async ({ browser }) => {
  const from = plus(monday, 7) // next Monday
  const to = plus(monday, 9) // next Wednesday
  const w = await seed(`${PREFIX}Drag Me`, from)

  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signInAsClient(page)
  await page.getByRole("button", { name: "Next week" }).click()
  await page.locator(`[data-drop-day="${from}"]`).click()

  const card = page.getByRole("heading", { name: `${PREFIX}Drag Me` })
  await expect(card).toBeVisible()
  await dragTo(page, card, page.locator(`[data-drop-day="${to}"]`))

  await expect.poll(() => dayOf(w.id)).toBe(to)
  // The view follows the session to its new day.
  await expect(page.getByRole("heading", { name: `${PREFIX}Drag Me` })).toBeVisible()
  const moved = await prisma.workout.findUniqueOrThrow({ where: { id: w.id } })
  expect(moved.movedById).toBe(clientId)
  await ctx.close()
})

test("the coach drags a session to a new day on the calendar", async ({ page }) => {
  const from = today
  const to = plus(today, 1)
  const w = await seed(`${PREFIX}Coach Move`, from)

  await page.goto(`/coach/clients/${clientId}`)
  await page.waitForLoadState("networkidle") // handlers attach on hydration
  const chip = page.locator(`[data-drop-day="${from}"]`).getByRole("link", { name: `${PREFIX}Coach Move` })
  await expect(chip).toBeVisible()
  await dragTo(page, chip, page.locator(`[data-drop-day="${to}"]`))

  await expect.poll(() => dayOf(w.id)).toBe(to)
  await expect(page.locator(`[data-drop-day="${to}"]`).getByRole("link", { name: `${PREFIX}Coach Move` })).toBeVisible()
  // Dragging did not also count as a click on the session.
  await expect(page).toHaveURL(new RegExp(`/coach/clients/${clientId}$`))
})

test("a plain click on a calendar session still opens it", async ({ page }) => {
  const w = await seed(`${PREFIX}Click Me`, today)
  await page.goto(`/coach/clients/${clientId}`)
  await page.getByRole("link", { name: `${PREFIX}Click Me` }).click()
  await expect(page).toHaveURL(new RegExp(`/workouts/${w.id}$`))
})

test("completed sessions stay where they were done", async ({ page }) => {
  const w = await seed(`${PREFIX}Done Already`, today, true)
  await page.goto(`/coach/clients/${clientId}`)
  await page.waitForLoadState("networkidle")
  // Scoped to the calendar: the sidebar's "Latest session" links it too.
  const chip = page.locator(`[data-drop-day="${today}"]`).getByRole("link", { name: `${PREFIX}Done Already` })
  await dragTo(page, chip, page.locator(`[data-drop-day="${plus(today, 1)}"]`))
  await page.waitForTimeout(800)
  expect(await dayOf(w.id)).toBe(today)
})
