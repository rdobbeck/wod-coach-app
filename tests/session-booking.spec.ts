import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"
import { bookingSlug, smsHref } from "../lib/booking"

/**
 * Booking an in-person session: the coach lists the places they train (each
 * with its own scheduling link) and a text number; the client picks a place
 * on Today and books a time there, or texts the coach directly.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })

const GYM_POD = "https://cal.com/dobbeck-training-systems/gym-pod"
const OFFSITE = "https://cal.com/dobbeck-training-systems/personal-training-offsite"
let coachId = ""

test.beforeAll(async () => {
  const coach = await prisma.user.findUniqueOrThrow({ where: { email: "playwright-coach@dev.local" } })
  coachId = coach.id
  await prisma.coachProfile.upsert({
    where: { userId: coachId },
    update: { textNumber: null },
    create: { userId: coachId, textNumber: null },
  })
  await prisma.sessionLocation.deleteMany({ where: { coachId } })
})

test.afterAll(async () => {
  await prisma.sessionLocation.deleteMany({ where: { coachId } })
  await prisma.coachProfile.update({ where: { userId: coachId }, data: { textNumber: null } })
  await prisma.$disconnect()
})

async function signInAsClient(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

test("helpers: event slug from a link, sms link from a phone number", () => {
  expect(bookingSlug(GYM_POD)).toBe("gym-pod")
  expect(bookingSlug("https://cal.com/dobbeck-training-systems/gym-pod/embed?x=1")).toBe("gym-pod")
  expect(bookingSlug("not a url")).toBeNull()

  expect(smsHref("(773) 491-7926")).toBe("sms:+17734917926")
  expect(smsHref("+1 773 491 7926")).toBe("sms:+17734917926")
  expect(smsHref("773-491-7926", "Hi Ryan, I'd like to set up a session")).toBe("sms:+17734917926?&body=Hi%20Ryan%2C%20I'd%20like%20to%20set%20up%20a%20session")
  expect(smsHref("12345")).toBeNull()
})

test("no places and no number means no session booking anywhere in the client app", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signInAsClient(page)
  await expect(page.getByRole("link", { name: /Book a session/ })).toBeHidden()

  await page.goto("/client/book/session")
  await page.waitForURL(/\/client$/)
  await ctx.close()
})

test("coach lists places and a text number; the client picks a place or texts", async ({ page, browser }) => {
  await page.goto("/coach/settings")
  const section = page.getByTestId("session-locations")

  // Two places. The first row is there to start with; the second is added.
  await section.getByPlaceholder("Gym Pod").nth(0).fill("Off-site (I come to you)")
  await section.getByPlaceholder("https://cal.com/you/gym-pod").nth(0).fill(OFFSITE)
  await section.getByRole("button", { name: "Add a place" }).click()
  await section.getByPlaceholder("Gym Pod").nth(1).fill("Gym Pod")
  await section.getByPlaceholder("https://cal.com/you/gym-pod").nth(1).fill(GYM_POD)
  await section.getByPlaceholder("(773) 491-7926").fill("(773) 491-7926")
  await section.getByRole("button", { name: "Save places" }).click()
  await expect(page.getByText("Clients can book a session")).toBeVisible()

  const saved = await prisma.sessionLocation.findMany({ where: { coachId }, orderBy: { sortOrder: "asc" } })
  expect(saved.map((l) => [l.label, l.url])).toEqual([
    ["Off-site (I come to you)", OFFSITE],
    ["Gym Pod", GYM_POD],
  ])
  expect((await prisma.coachProfile.findUniqueOrThrow({ where: { userId: coachId } })).textNumber).toBe("+17734917926")

  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const clientPage = await ctx.newPage()
  await signInAsClient(clientPage)

  const card = clientPage.getByRole("link", { name: /Book a session/ })
  await expect(card).toBeVisible()
  await card.click()
  await clientPage.waitForURL(/\/client\/book\/session$/)

  // The places, in the coach's order, and the way to text instead.
  const places = clientPage.getByTestId("place")
  await expect(places).toHaveCount(2)
  await expect(places.nth(0)).toContainText("Off-site (I come to you)")
  await expect(places.nth(1)).toContainText("Gym Pod")
  await expect(clientPage.getByRole("link", { name: /Text .* to set up a time/ })).toHaveAttribute("href", /^sms:\+17734917926/)
  await expect(clientPage.locator("iframe")).toHaveCount(0)

  // Picking a place embeds that place's scheduling page.
  await places.nth(1).click()
  await clientPage.waitForURL(/\/client\/book\/session\?at=/)
  await expect(clientPage.locator("iframe")).toHaveAttribute("src", /cal\.com\/dobbeck-training-systems\/gym-pod\?.*embed=true/)
  await expect(clientPage.getByRole("link", { name: "Open the full booking page" })).toHaveAttribute("href", GYM_POD)
  // Still one tap from the other places.
  await expect(clientPage.getByRole("link", { name: /Off-site/ })).toBeVisible()

  await ctx.close()
})

test("a text number on its own is enough for the card", async ({ browser }) => {
  await prisma.sessionLocation.deleteMany({ where: { coachId } })
  await prisma.coachProfile.update({ where: { userId: coachId }, data: { textNumber: "+17734917926" } })

  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signInAsClient(page)
  await page.getByRole("link", { name: /Book a session/ }).click()
  await page.waitForURL(/\/client\/book\/session$/)
  await expect(page.getByTestId("place")).toHaveCount(0)
  await expect(page.getByRole("link", { name: /Text .* to set up a time/ })).toBeVisible()
  await ctx.close()
})
