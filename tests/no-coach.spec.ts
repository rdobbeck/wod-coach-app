import { test, expect } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { dbUrl } from "../lib/db-url"

/**
 * An account with no coach and nothing scheduled says so on Today and names
 * the email it is signed in with, so signing in with the wrong Google account
 * is obvious instead of an empty app.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })
const EMAIL = "pw-no-coach@dev.local"
const PASSWORD = "playwright-test-PW-1"

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } })
  await prisma.user.create({
    data: { email: EMAIL, name: "No Coach", role: "CLIENT", hashedPassword: await bcrypt.hash(PASSWORD, 10), clientProfile: { create: { tourSeenAt: new Date() } } },
  })
})
test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } })
  await prisma.$disconnect()
})

async function signIn(browser: import("@playwright/test").Browser, email: string) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
  return { ctx, page }
}

test("an account with no coach is told which email it is and how to switch", async ({ browser }) => {
  const { ctx, page } = await signIn(browser, EMAIL)
  const card = page.getByTestId("no-coach")
  await expect(card).toBeVisible()
  await expect(card).toContainText(EMAIL)
  await expect(card.getByRole("button", { name: "Sign out" })).toBeVisible()
  await ctx.close()
})

test("a client with a coach never sees it", async ({ browser }) => {
  const { ctx, page } = await signIn(browser, "playwright-client@dev.local")
  await expect(page.getByRole("heading").first()).toBeVisible()
  await expect(page.getByTestId("no-coach")).toHaveCount(0)
  await ctx.close()
})
