import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"

/**
 * One thing on Today asks for a tap. A client with nothing on the coach's
 * calendar is asked to book a session; once one is booked the pulse goes away.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })
const UID = "playwright-today-cta"
let coachId = ""
let clientId = ""

test.beforeAll(async () => {
  coachId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-coach@dev.local" } })).id
  clientId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })).id
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { tourSeenAt: new Date() } })
  await prisma.sessionLocation.deleteMany({ where: { coachId } })
  await prisma.sessionLocation.create({ data: { coachId, label: "Gym Pod", url: "https://cal.com/dobbeck-training-systems/gym-pod", sortOrder: 1 } })
  await prisma.sessionEvent.deleteMany({ where: { coachId, clientIds: { has: clientId } } })
})

test.afterAll(async () => {
  await prisma.sessionEvent.deleteMany({ where: { coachId, clientIds: { has: clientId } } })
  await prisma.sessionLocation.deleteMany({ where: { coachId } })
  await prisma.$disconnect()
})

async function signInAsClient(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

test("with nothing on the calendar, Book a session is the one that pulses", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signInAsClient(page)
  await expect(page.getByRole("link", { name: /Book a session/ })).toHaveClass(/pulse-cta/)
  await ctx.close()
})

test("once a session is booked, Book a session stops pulsing", async ({ browser }) => {
  const start = new Date(Date.now() + 2 * 86_400_000)
  await prisma.sessionEvent.create({
    data: { coachId, uid: UID, clientIds: [clientId], title: "Personal Training 1HR Playwright 1/10", startsAt: start, endsAt: new Date(start.getTime() + 3_600_000), packageIndex: 1, packageSize: 10 },
  })
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signInAsClient(page)
  const book = page.getByRole("link", { name: /Book a session/ })
  await expect(book).toBeVisible()
  await expect(book).not.toHaveClass(/pulse-cta/)
  await ctx.close()
})
