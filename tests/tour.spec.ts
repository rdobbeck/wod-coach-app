import { test, expect, type Browser, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"

/**
 * The first-run walkthrough: it opens itself once, covers the things nobody
 * finds on their own, and never comes back uninvited.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })

let clientId = ""

test.beforeAll(async () => {
  const client = await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })
  clientId = client.id
})

test.afterAll(async () => {
  // Leave the shared test client the way the other specs expect to find it.
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { tourSeenAt: new Date(), canAskAi: false } })
  await prisma.$disconnect()
})

const unseen = () => prisma.clientProfile.update({ where: { userId: clientId }, data: { tourSeenAt: null } })

async function signIn(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

test("a new client is walked through the app once, then left alone", async ({ browser }) => {
  test.setTimeout(90_000)
  await unseen()
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signIn(page)

  const tour = page.getByRole("dialog", { name: "App walkthrough" })
  await expect(tour).toBeVisible()
  await expect(tour.getByRole("heading")).toHaveText("Here's where everything lives")

  // The things the tour exists to teach, in the order it teaches them.
  const titles: string[] = []
  for (let i = 0; i < 12; i++) {
    titles.push((await tour.getByRole("heading").textContent()) ?? "")
    const next = tour.getByRole("button", { name: "Next" })
    if (!(await next.isVisible())) break
    await next.click()
  }
  // Where things live first, the rest timer along the way, notifications near the end.
  expect(titles[0]).toBe("Here's where everything lives")
  expect(titles).toContain("The rest timer runs itself")
  expect(titles).toContain("Turn on notifications")

  // Back really does go back.
  await tour.getByRole("button", { name: "Back" }).click()
  await expect(tour.getByRole("heading")).toHaveText(titles[titles.length - 2])
  await tour.getByRole("button", { name: "Next" }).click()

  await tour.getByRole("button", { name: "Start training" }).click()
  await expect(tour).toBeHidden()

  // It is remembered server side, so a reload and a new device both stay clear.
  await expect
    .poll(async () => (await prisma.clientProfile.findUniqueOrThrow({ where: { userId: clientId } })).tourSeenAt !== null)
    .toBe(true)
  await page.reload()
  await expect(page.getByRole("dialog", { name: "App walkthrough" })).toBeHidden()

  await ctx.close()
})

/** Walk the whole tour as a fresh client, then wait for the seen write so it cannot land after a later reset. */
async function walkTour(browser: Browser) {
  await unseen()
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signIn(page)
  const tour = page.getByRole("dialog", { name: "App walkthrough" })
  // Today renders on the server behind a loading state; give it the same room as sign-in.
  await expect(tour).toBeVisible({ timeout: 15_000 })
  const titles: string[] = []
  let askAi = ""
  let pill = ""
  for (let i = 0; i < 12; i++) {
    const title = (await tour.getByRole("heading").textContent()) ?? ""
    titles.push(title)
    if (title === "Ask the AI about your training") {
      askAi = (await tour.textContent()) ?? ""
      pill = await tour.locator("span", { hasText: /^\S Ask AI$/ }).evaluate((el) => getComputedStyle(el).backgroundColor)
    }
    const next = tour.getByRole("button", { name: "Next" })
    if (!(await next.isVisible())) break
    await next.click()
  }
  await expect
    .poll(async () => (await prisma.clientProfile.findUniqueOrThrow({ where: { userId: clientId } })).tourSeenAt !== null)
    .toBe(true)
  await ctx.close()
  return { titles, askAi, pill }
}

test("the Ask AI slide appears only when the coach switched Ask AI on", async ({ browser }) => {
  test.setTimeout(90_000)
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: true } })
  const withAi = await walkTour(browser)
  expect(withAi.titles).toContain("Ask the AI about your training")
  // It sits after the week slide (when present) and before notifications.
  expect(withAi.titles.indexOf("Ask the AI about your training")).toBeLessThan(withAi.titles.indexOf("Turn on notifications"))
  // Clients review every change by default (auto-apply is off for them), so the promise is plain.
  expect(withAi.askAi).toMatch(/Nothing changes until you tap Apply/)
  expect(withAi.askAi).not.toMatch(/load tweaks/)

  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: false } })
  const withoutAi = await walkTour(browser)
  expect(withoutAi.titles).not.toContain("Ask the AI about your training")
})

test("no active coach, no Ask AI slide, even with the switch on", async ({ browser }) => {
  test.setTimeout(90_000)
  const link = await prisma.clientCoach.findFirstOrThrow({ where: { clientId, status: "ACTIVE" } })
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: true } })
  await prisma.clientCoach.update({ where: { id: link.id }, data: { status: "INACTIVE" } })
  try {
    const walked = await walkTour(browser)
    expect(walked.titles).not.toContain("Ask the AI about your training")
  } finally {
    await prisma.clientCoach.update({ where: { id: link.id }, data: { status: "ACTIVE" } })
    await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: false } })
  }
})

test("the slide's Ask AI button is red whatever the theme, like the real one", async ({ browser }) => {
  test.setTimeout(90_000)
  const before = (await prisma.clientProfile.findUniqueOrThrow({ where: { userId: clientId } })).theme
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: true, theme: "midnight" } })
  try {
    const walked = await walkTour(browser)
    expect(walked.pill).toBe("rgb(193, 39, 45)")
  } finally {
    await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: false, theme: before } })
  }
})

test("skipping counts as seen, so it never ambushes them twice", async ({ browser }) => {
  await unseen()
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signIn(page)

  const tour = page.getByRole("dialog", { name: "App walkthrough" })
  await expect(tour).toBeVisible()
  await tour.getByRole("button", { name: "Skip" }).click()
  await expect(tour).toBeHidden()

  await expect
    .poll(async () => (await prisma.clientProfile.findUniqueOrThrow({ where: { userId: clientId } })).tourSeenAt !== null)
    .toBe(true)

  await ctx.close()
})

test("anyone can ask for the tour again from Settings", async ({ browser }) => {
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { tourSeenAt: new Date() } })
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signIn(page)
  await expect(page.getByRole("dialog", { name: "App walkthrough" })).toBeHidden()

  await page.goto("/client/profile")
  const replay = page.getByRole("button", { name: "Show me around the app again" })
  await expect(replay).toBeEnabled()
  await replay.click()

  const tour = page.getByRole("dialog", { name: "App walkthrough" })
  await expect(tour).toBeVisible()
  await tour.getByRole("button", { name: "Skip" }).click()
  await expect(tour).toBeHidden()

  await ctx.close()
})
