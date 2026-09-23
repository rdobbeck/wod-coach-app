import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"
import { bookingFor } from "../lib/booking"

/**
 * Booking a video call: the coach sets a link, the client gets a card on Today
 * and picks a time inside the app.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })

const CAL = "https://cal.com/dobbeck-training-systems/check-in"
let coachId = ""

test.beforeAll(async () => {
  const coach = await prisma.user.findUniqueOrThrow({ where: { email: "playwright-coach@dev.local" } })
  coachId = coach.id
  await prisma.coachProfile.upsert({
    where: { userId: coachId },
    update: { bookingUrl: null },
    create: { userId: coachId, bookingUrl: null },
  })
})

test.afterAll(async () => {
  await prisma.coachProfile.update({ where: { userId: coachId }, data: { bookingUrl: null } })
  await prisma.$disconnect()
})

async function signInAsClient(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

test("normalising booking links", () => {
  expect(bookingFor(null)).toBeNull()
  expect(bookingFor("   ")).toBeNull()
  expect(bookingFor("not a url")).toBeNull()
  // http is refused: the page is embedded, so it has to be secure.
  expect(bookingFor("http://cal.com/x/y")).toBeNull()

  const cal = bookingFor(CAL)!
  expect(cal.embedUrl).toContain("/check-in/embed")
  expect(cal.embedUrl).toContain("layout=mobile")

  const calendly = bookingFor("https://calendly.com/dobbecktraining/60min")!
  expect(calendly.embedUrl).toContain("embed_type=Inline")

  // Anything else is still usable, just not embeddable.
  const other = bookingFor("https://example.com/book")!
  expect(other.embedUrl).toBeNull()
  expect(other.url).toBe("https://example.com/book")
})

test("no link means no booking anywhere in the client app", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signInAsClient(page)
  await expect(page.getByRole("link", { name: /Book a call/ })).toBeHidden()

  // The page itself sends them back rather than rendering an empty frame.
  await page.goto("/client/book")
  await page.waitForURL(/\/client$/)
  await ctx.close()
})

test("coach sets a link and the client can book from Today", async ({ page, browser }) => {
  await page.goto("/coach/settings")
  const field = page.getByPlaceholder("https://cal.com/you/check-in")
  await field.fill(CAL)
  const save = field.locator("xpath=following-sibling::button")
  await expect(save).toBeEnabled()
  await save.click()
  await expect(page.getByText("Clients can book a call")).toBeVisible()

  expect((await prisma.coachProfile.findUniqueOrThrow({ where: { userId: coachId } })).bookingUrl).toBe(CAL)

  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const clientPage = await ctx.newPage()
  await signInAsClient(clientPage)

  const card = clientPage.getByRole("link", { name: /Book a call/ })
  await expect(card).toBeVisible()
  await card.click()
  await clientPage.waitForURL(/\/client\/book/)

  // The booking page embeds the coach's real scheduling page.
  const frame = clientPage.locator("iframe")
  await expect(frame).toHaveAttribute("src", /cal\.com\/dobbeck-training-systems\/check-in\/embed/)
  await expect(clientPage.getByRole("link", { name: "Open the full booking page" })).toHaveAttribute("href", CAL)

  await ctx.close()
})
