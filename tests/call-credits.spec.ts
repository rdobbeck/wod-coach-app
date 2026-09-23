import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import crypto from "crypto"
import { dbUrl } from "../lib/db-url"
import { callCreditsFor, creditsLabel, monthRange } from "../lib/call-credits"

/**
 * Two free calls a month, counted from real bookings, reset by the calendar.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })

const CAL = "https://cal.com/dobbeck-training-systems/check-in"
let clientId = ""
let coachId = ""

/** A Cal.com webhook call, signed the way Cal signs it. */
async function calWebhook(page: Page, body: Record<string, unknown>, secret = process.env.CAL_WEBHOOK_SECRET!) {
  const raw = JSON.stringify(body)
  return page.request.post("/api/webhooks/cal", {
    headers: {
      "Content-Type": "application/json",
      "x-cal-signature-256": crypto.createHmac("sha256", secret).update(raw).digest("hex"),
    },
    data: raw,
  })
}

const booking = (uid: string, startsAt: Date) => ({
  triggerEvent: "BOOKING_CREATED",
  payload: {
    uid,
    title: "20 min check-in",
    startTime: startsAt.toISOString(),
    endTime: new Date(startsAt.getTime() + 20 * 60_000).toISOString(),
    attendees: [{ email: "playwright-client@dev.local", name: "Playwright Client" }],
  },
})

test.beforeAll(async () => {
  const client = await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })
  const coach = await prisma.user.findUniqueOrThrow({ where: { email: "playwright-coach@dev.local" } })
  clientId = client.id
  coachId = coach.id
  await prisma.coachProfile.upsert({
    where: { userId: coachId },
    update: { bookingUrl: CAL, monthlyCallCredits: 2 },
    create: { userId: coachId, bookingUrl: CAL, monthlyCallCredits: 2 },
  })
  await prisma.callBooking.deleteMany({ where: { clientId } })
})

test.afterAll(async () => {
  await prisma.callBooking.deleteMany({ where: { clientId } })
  await prisma.coachProfile.update({ where: { userId: coachId }, data: { bookingUrl: null } })
  await prisma.$disconnect()
})

test.beforeEach(async () => {
  await prisma.callBooking.deleteMany({ where: { clientId } })
})

async function signInAsClient(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

test("credits count bookings in the month the call falls in", async () => {
  const { start } = monthRange()
  const thisMonth = new Date(start.getTime() + 10 * 86_400_000)
  const nextMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 12))

  const fresh = await callCreditsFor(clientId, coachId)
  expect(fresh.left).toBe(2)
  expect(creditsLabel(fresh)).toBe("2 free calls left this month.")

  await prisma.callBooking.create({
    data: { externalId: "t-1", clientId, coachId, startsAt: thisMonth },
  })
  expect((await callCreditsFor(clientId, coachId)).left).toBe(1)

  // A call scheduled into next month spends next month's allowance, not this one.
  await prisma.callBooking.create({
    data: { externalId: "t-2", clientId, coachId, startsAt: nextMonth },
  })
  expect((await callCreditsFor(clientId, coachId)).left).toBe(1)
  expect((await callCreditsFor(clientId, coachId, nextMonth)).left).toBe(1)

  // Cancelling hands the call straight back.
  await prisma.callBooking.update({ where: { externalId: "t-1" }, data: { cancelled: true } })
  expect((await callCreditsFor(clientId, coachId)).left).toBe(2)
})

test("an unsigned webhook is refused", async ({ page }) => {
  const res = await page.request.post("/api/webhooks/cal", {
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify(booking("nope", new Date())),
  })
  expect(res.status()).toBe(401)

  const wrong = await calWebhook(page, booking("nope-2", new Date()), "not-the-secret")
  expect(wrong.status()).toBe(401)
  expect(await prisma.callBooking.count({ where: { clientId } })).toBe(0)
})

test("booking through the webhook spends a call, cancelling returns it", async ({ page, browser }) => {
  const { start } = monthRange()
  const when = new Date(start.getTime() + 15 * 86_400_000)

  const created = await calWebhook(page, booking("cal-abc", when))
  expect(created.ok()).toBe(true)
  expect((await callCreditsFor(clientId, coachId)).left).toBe(1)

  // Cal replays webhooks; the same uid must not spend a second call.
  await calWebhook(page, booking("cal-abc", when))
  expect((await callCreditsFor(clientId, coachId)).left).toBe(1)

  // The client sees the count on Today and on the booking page.
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const clientPage = await ctx.newPage()
  await signInAsClient(clientPage)
  await expect(clientPage.getByText("1 free call left this month")).toBeVisible()
  await clientPage.goto("/client/book")
  await expect(clientPage.getByText("1 free call left this month.")).toBeVisible()

  // Spend the second, and the copy says so without blocking them.
  await calWebhook(page, booking("cal-def", new Date(when.getTime() + 86_400_000)))
  expect((await callCreditsFor(clientId, coachId)).left).toBe(0)
  await clientPage.reload()
  await expect(clientPage.getByText(/used both free calls this month/)).toBeVisible()
  await expect(clientPage.locator("iframe")).toBeVisible()

  // Cancellation returns the call.
  await calWebhook(page, { triggerEvent: "BOOKING_CANCELLED", payload: { uid: "cal-def" } })
  expect((await callCreditsFor(clientId, coachId)).left).toBe(1)

  await ctx.close()
})
