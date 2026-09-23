import { test, expect, type Page } from "@playwright/test"
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
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { tourSeenAt: new Date() } })
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
  await expect(tour.getByRole("heading")).toHaveText("Here is where everything lives")

  // The things the tour exists to teach, in the order it teaches them.
  const titles: string[] = []
  for (let i = 0; i < 12; i++) {
    titles.push((await tour.getByRole("heading").textContent()) ?? "")
    const next = tour.getByRole("button", { name: "Next" })
    if (!(await next.isVisible())) break
    await next.click()
  }
  expect(titles).toContain("Log a set without typing")
  expect(titles).toContain("The rest timer runs itself")
  expect(titles).toContain("Film a set and get it looked at")
  expect(titles).toContain("One last thing")

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
