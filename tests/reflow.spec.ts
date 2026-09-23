import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"
import { planReflow, weekDays } from "../lib/reflow"
import { dayKey, fromDayKey } from "../lib/training"

/**
 * Planning a week: the client says which days they can train and their
 * sessions spread across those days, keeping the coach's order.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })

let clientId = ""
let coachId = ""

const S = (id: string, day: string, name = id) => ({ id, day, name })

test.beforeAll(async () => {
  const client = await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })
  const coach = await prisma.user.findUniqueOrThrow({ where: { email: "playwright-coach@dev.local" } })
  clientId = client.id
  coachId = coach.id
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canMoveWorkouts: true } })
  // Other specs seed workouts for this same client; a week plan sees all of
  // them, so start from an empty calendar.
  await prisma.workout.deleteMany({ where: { clientId } })
})

test.afterAll(async () => {
  await prisma.workout.deleteMany({ where: { clientId, name: { startsWith: "Reflow " } } })
  await prisma.$disconnect()
})

/** Three sessions this week, Mon/Wed/Fri of the current week. */
async function seed(days: string[]) {
  await prisma.workout.deleteMany({ where: { clientId, name: { startsWith: "Reflow " } } })
  for (let i = 0; i < days.length; i++) {
    const d = fromDayKey(days[i])
    await prisma.workout.create({
      data: {
        clientId,
        name: `Reflow ${i + 1}`,
        scheduledDate: d,
        dayOfWeek: d.getUTCDay(),
        order: 1,
        exercises: { create: [{ name: "Back Squat", prescription: "3 x 5", order: 1 }] },
      },
    })
  }
}

async function signInAsClient(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

test("sessions spread evenly, and the heavy day comes first", () => {
  const days = ["2026-10-05", "2026-10-07", "2026-10-09"]

  // Three into three: one each, in order.
  const even = planReflow([S("a", "2026-10-06"), S("b", "2026-10-08"), S("c", "2026-10-10")], days)
  expect(even.map((m) => m.to)).toEqual(days)

  // Four into three: the extra lands on the first day, not the last. The last
  // session is already on its target day, so it is not listed as a move.
  const four = planReflow(
    [S("a", "2026-10-06"), S("b", "2026-10-07"), S("c", "2026-10-08"), S("d", "2026-10-09")],
    days
  )
  expect(four.map((m) => m.to)).toEqual(["2026-10-05", "2026-10-05", "2026-10-07"])

  // Two into three: nothing is invented to fill the spare day.
  expect(planReflow([S("a", "2026-10-06"), S("b", "2026-10-08")], days)).toHaveLength(2)

  // A session already on a chosen day is left alone.
  const settled = planReflow([S("a", "2026-10-05"), S("b", "2026-10-07"), S("c", "2026-10-09")], days)
  expect(settled).toHaveLength(0)

  // Edge cases do not throw.
  expect(planReflow([], days)).toEqual([])
  expect(planReflow([S("a", "2026-10-06")], [])).toEqual([])
})

test("a week is seven days, Monday first", () => {
  // 2026-10-08 is a Thursday.
  const w = weekDays(fromDayKey("2026-10-08"))
  expect(w).toHaveLength(7)
  expect(w[0]).toBe("2026-10-05")
  expect(w[6]).toBe("2026-10-11")
})

test("a client reshapes their week and the coach sees where it went", async ({ browser, page }) => {
  test.setTimeout(90_000)
  const week = weekDays(new Date())
  const today = dayKey(new Date())
  // Only days from today on can be used, so build the test around those.
  const ahead = week.filter((d) => d >= today)
  test.skip(ahead.length < 3, "needs at least three days left in the week")

  await seed(ahead.slice(0, 3))

  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const clientPage = await ctx.newPage()
  await signInAsClient(clientPage)

  // Preview first: nothing moves until the client has seen what would.
  const dry = await clientPage.request.post("/api/week/reflow", {
    data: { days: [ahead[0]], today, dryRun: true },
  })
  expect(dry.ok()).toBe(true)
  const plan = (await dry.json()) as { sessions: number; moves: { to: string }[] }
  expect(plan.sessions).toBe(3)
  expect(plan.moves).toHaveLength(2)

  const before = await prisma.workout.findMany({
    where: { clientId, name: { startsWith: "Reflow " } },
    select: { scheduledDate: true },
  })
  expect(new Set(before.map((w) => dayKey(w.scheduledDate))).size).toBe(3)

  // Commit: all three collapse onto the one day they can train.
  const real = await clientPage.request.post("/api/week/reflow", { data: { days: [ahead[0]], today } })
  expect(real.ok()).toBe(true)
  expect((await real.json()).moved).toBe(2)

  const after = await prisma.workout.findMany({
    where: { clientId, name: { startsWith: "Reflow " } },
    orderBy: { order: "asc" },
    select: { scheduledDate: true, order: true, originalDate: true, movedById: true },
  })
  expect(after.every((w) => dayKey(w.scheduledDate) === ahead[0])).toBe(true)
  expect(after.map((w) => w.order)).toEqual([1, 1, 2])

  // The two that moved record where they came from and who moved them.
  const moved = after.filter((w) => w.originalDate)
  expect(moved).toHaveLength(2)
  expect(moved.every((w) => w.movedById === clientId)).toBe(true)

  // The coach's calendar shows them on the new day.
  await page.goto(`/coach/clients/${clientId}`)
  await expect(page.getByText("Reflow 1").first()).toBeVisible()

  await ctx.close()
})

test("a client whose coach turned off moving cannot reshape the week", async ({ browser }) => {
  const week = weekDays(new Date()).filter((d) => d >= dayKey(new Date()))
  test.skip(week.length < 1, "needs a day left in the week")
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canMoveWorkouts: false } })

  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signInAsClient(page)

  const res = await page.request.post("/api/week/reflow", { data: { days: [week[0]], today: dayKey(new Date()) } })
  expect(res.status()).toBe(403)

  // And the button is not offered either.
  await expect(page.getByRole("button", { name: "Plan my week" })).toBeHidden()

  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canMoveWorkouts: true } })
  await ctx.close()
})

test("days in the past are refused", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signInAsClient(page)

  const yesterday = dayKey(new Date(Date.now() - 86_400_000))
  const res = await page.request.post("/api/week/reflow", { data: { days: [yesterday], today: dayKey(new Date()) } })
  expect(res.status()).toBe(400)

  const none = await page.request.post("/api/week/reflow", { data: { days: [], today: dayKey(new Date()) } })
  expect(none.status()).toBe(400)

  await ctx.close()
})
