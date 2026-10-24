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

/** The seven days of next week, which are always all still ahead. */
const nextWeek = () => weekDays(new Date(Date.now() + 7 * 86_400_000))

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
  const today = dayKey(new Date())
  // Next week is always wholly ahead, so this runs on a Saturday or Sunday too.
  const ahead = nextWeek()

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
  // One per slot on the day, in the coach's order.
  expect(after.map((w) => w.order)).toEqual([1, 2, 3])

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

test("sessions sharing a day keep the coach's order", async ({ browser }) => {
  const week = nextWeek()
  // The first sits early in the week; the second is already on the only day picked.
  await seed([week[0], week[6]])

  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signInAsClient(page)

  const res = await page.request.post("/api/week/reflow", { data: { days: [week[6]], today: dayKey(new Date()) } })
  expect(res.ok()).toBe(true)

  const after = await prisma.workout.findMany({
    where: { clientId, name: { startsWith: "Reflow " } },
    orderBy: [{ scheduledDate: "asc" }, { order: "asc" }],
    select: { name: true, scheduledDate: true, order: true },
  })
  expect(after.every((w) => dayKey(w.scheduledDate) === week[6])).toBe(true)
  // No two sessions share a slot, and the coach's first session is still first.
  expect(after.map((w) => w.order)).toEqual([1, 2])
  expect(after.map((w) => w.name)).toEqual(["Reflow 1", "Reflow 2"])

  await ctx.close()
})

test("days from two different weeks are refused", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signInAsClient(page)

  const later = weekDays(new Date(Date.now() + 14 * 86_400_000))
  const res = await page.request.post("/api/week/reflow", {
    data: { days: [nextWeek()[0], later[0]], today: dayKey(new Date()), dryRun: true },
  })
  expect(res.status()).toBe(400)

  await ctx.close()
})

test("the sheet plans the week on screen, through to moving the sessions", async ({ browser }) => {
  test.setTimeout(90_000)
  const week = nextWeek()
  await seed([week[0], week[2], week[4]])

  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await signInAsClient(page)

  // Open it once on this week, so paging has stale state to get wrong.
  const plan = page.getByRole("button", { name: "Plan my week" })
  await plan.click()
  await page.getByRole("button", { name: "Cancel" }).click()

  await page.getByRole("button", { name: "Next week" }).click()
  await plan.click()

  // Every day of next week starts ticked.
  const sheet = page.getByRole("dialog", { name: "Plan my week" })
  const chips = sheet.locator("button[aria-pressed]")
  await expect(chips).toHaveCount(7)
  await expect(sheet.locator('button[aria-pressed="true"]')).toHaveCount(7)

  // Keep only Monday and Tuesday.
  for (const i of [2, 3, 4, 5, 6]) await chips.nth(i).click()

  const dry = page.waitForRequest((r) => r.url().includes("/api/week/reflow"))
  await page.getByRole("button", { name: "Show me" }).click()
  expect(JSON.parse((await dry).postData() ?? "{}").days).toEqual([week[0], week[1]])
  await expect(page.getByText("Reflow 2", { exact: true })).toBeVisible()

  // Closing throws the preview away; opening again starts fresh.
  await page.getByRole("button", { name: "Cancel" }).click()
  await plan.click()
  await expect(page.getByRole("button", { name: "Move them" })).toBeHidden()
  await expect(sheet.locator('button[aria-pressed="true"]')).toHaveCount(7)
  for (const i of [2, 3, 4, 5, 6]) await chips.nth(i).click()
  await page.getByRole("button", { name: "Show me" }).click()

  await page.getByRole("button", { name: "Move them" }).click()
  await expect(page.getByText("Moved 2 sessions")).toBeVisible()

  const after = await prisma.workout.findMany({
    where: { clientId, name: { startsWith: "Reflow " } },
    orderBy: { name: "asc" },
    select: { scheduledDate: true, order: true },
  })
  expect(after.map((w) => `${dayKey(w.scheduledDate)}#${w.order}`)).toEqual([`${week[0]}#1`, `${week[0]}#2`, `${week[1]}#1`])

  await ctx.close()
})
