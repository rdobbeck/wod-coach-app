import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"
import { dayKey, fromDayKey } from "../lib/training"

/**
 * Imported programs get the same controls as any other, and any program can be
 * copied onto a client as a draft to review before it goes live.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })

const NAME = "Copy Source Block"
let clientId = ""
let coachId = ""
let sourceId = ""

test.beforeAll(async () => {
  clientId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })).id
  coachId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-coach@dev.local" } })).id
  await cleanup()
  const src = await prisma.program.create({
    data: {
      name: NAME,
      coachId,
      clientId,
      startDate: fromDayKey("2025-03-03"),
      endDate: fromDayKey("2025-03-12"),
      isActive: false,
      programType: "COACHRX_IMPORT",
      goals: [],
    },
  })
  sourceId = src.id
  // Day 1 as planned, and a day-3 session the client had moved to day 4 and done.
  await prisma.workout.create({
    data: {
      clientId, programId: src.id, name: `${NAME} A`, scheduledDate: fromDayKey("2025-03-03"), dayOfWeek: 1, order: 1,
      coachNotes: "Brace hard",
      exercises: { create: [{ name: "Back Squat", prescription: "5 x 5", order: 1 }, { name: "Plank", prescription: "3 x 30s", order: 2 }] },
    },
  })
  await prisma.workout.create({
    data: {
      clientId, programId: src.id, name: `${NAME} B`, scheduledDate: fromDayKey("2025-03-06"), originalDate: fromDayKey("2025-03-05"),
      dayOfWeek: 4, order: 1, isCompleted: true,
      exercises: { create: [{ name: "Strict Press", prescription: "4 x 6", order: 1 }] },
    },
  })
})

async function cleanup() {
  const ps = await prisma.program.findMany({ where: { clientId, name: NAME }, select: { id: true } })
  await prisma.workout.deleteMany({ where: { programId: { in: ps.map((p) => p.id) } } })
  await prisma.program.deleteMany({ where: { id: { in: ps.map((p) => p.id) } } })
}

test.afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})

test("a program copies onto a client as a draft, on the coach's planned days", async ({ page }) => {
  const res = await page.request.post(`/api/programs/${sourceId}/copy`, { data: { clientId, startDate: "2027-02-01" } })
  expect(res.ok()).toBe(true)
  const { programId } = (await res.json()) as { programId: string }

  const copy = await prisma.program.findUniqueOrThrow({
    where: { id: programId },
    include: { workouts: { orderBy: { scheduledDate: "asc" }, include: { exercises: { orderBy: { order: "asc" } } } } },
  })
  expect(copy.isDraft).toBe(true)
  expect(dayKey(copy.startDate)).toBe("2027-02-01")
  expect(copy.endDate && dayKey(copy.endDate)).toBe("2027-02-10")

  // Same spacing as planned: B goes back to day 3, not the day it was moved to.
  expect(copy.workouts.map((w) => dayKey(w.scheduledDate))).toEqual(["2027-02-01", "2027-02-03"])
  expect(copy.workouts[0].exercises.map((e) => e.name)).toEqual(["Back Squat", "Plank"])
  expect(copy.workouts[0].coachNotes).toBe("Brace hard")

  // A fresh start: nothing done, nothing moved.
  expect(copy.workouts.every((w) => !w.isCompleted && !w.originalDate && !w.movedById)).toBe(true)
})

async function signInAsClient(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

test("a client cannot copy programs", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signInAsClient(page)
  const res = await page.request.post(`/api/programs/${sourceId}/copy`, { data: { clientId, startDate: "2027-02-01" } })
  expect(res.status()).toBe(404)
  await ctx.close()
})

test("an imported program has the same controls, including copy", async ({ page }) => {
  await page.goto(`/coach/clients/${clientId}`)
  await page.waitForLoadState("networkidle")
  // The original import starts in 2025, so it sorts below any copies made above.
  const row = page.locator("li").filter({ hasText: NAME }).last()
  await expect(row.getByRole("button", { name: "Unpublish" })).toBeVisible()
  await expect(row.getByRole("button", { name: "Remove" })).toBeVisible()

  await row.getByRole("button", { name: "Copy to…" }).click()
  await row.getByLabel("Copy start date").fill("2027-03-01")
  await row.getByRole("button", { name: "Copy as draft" }).click()

  await expect(page.getByText(/copied to .* as a draft/)).toBeVisible({ timeout: 20_000 })
  await expect
    .poll(async () => prisma.program.count({ where: { clientId, name: NAME, isDraft: true, startDate: fromDayKey("2027-03-01") } }))
    .toBe(1)
})
