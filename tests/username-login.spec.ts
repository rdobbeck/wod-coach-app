import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"

/**
 * Signing in with a username instead of an email. The client picks one in
 * Settings, then either works in the sign-in box.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })

const CLIENT_EMAIL = "playwright-client@dev.local"
const CLIENT_PW = "playwright-test-PW-1"
const COACH_EMAIL = "playwright-coach@dev.local"
const USERNAME = `pw_client_${Date.now().toString(36)}`
const COACH_USERNAME = `pw_coach_${Date.now().toString(36)}`

test.beforeAll(async () => {
  await prisma.user.update({ where: { email: CLIENT_EMAIL }, data: { username: null } })
  await prisma.user.update({ where: { email: COACH_EMAIL }, data: { username: COACH_USERNAME } })
})

test.afterAll(async () => {
  await prisma.user.updateMany({ where: { email: { in: [CLIENT_EMAIL, COACH_EMAIL] } }, data: { username: null } })
  await prisma.$disconnect()
})

async function signIn(page: Page, login: string, password: string) {
  await page.goto("/auth/signin")
  await page.getByLabel("Email or username").fill(login)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('button[type="submit"]').click()
}

test("client sets a username in Settings and signs in with it", async ({ browser }) => {
  test.setTimeout(120_000) // four sign-ins on a cold dev server
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()

  await signIn(page, CLIENT_EMAIL, CLIENT_PW)
  await page.waitForURL(/\/client$/, { timeout: 15_000 })

  await page.goto("/client/profile")
  const field = page.getByPlaceholder("e.g. sasha_k")
  await field.fill(USERNAME.toUpperCase()) // stored lowercase regardless of how it's typed
  await page.getByRole("button", { name: "Save username" }).click()
  await expect(page.getByText("Username saved")).toBeVisible()
  const stored = await prisma.user.findUnique({ where: { email: CLIENT_EMAIL }, select: { username: true } })
  expect(stored?.username).toBe(USERNAME)

  // A name someone else already has is refused.
  await field.fill(COACH_USERNAME)
  await page.getByRole("button", { name: "Save username" }).click()
  await expect(page.getByText("That username is taken")).toBeVisible()

  // Sign out and back in with the username.
  await ctx.clearCookies()
  await signIn(page, USERNAME, CLIENT_PW)
  await page.waitForURL(/\/client$/, { timeout: 15_000 })

  // Wrong password with the right username is still refused.
  await ctx.clearCookies()
  await signIn(page, USERNAME, "not-the-password")
  await expect(page.getByText(/Invalid email, username or password/)).toBeVisible()

  // Email keeps working, whatever the capitalisation.
  await ctx.clearCookies()
  await signIn(page, "Playwright-Client@Dev.Local", CLIENT_PW)
  await page.waitForURL(/\/client$/, { timeout: 15_000 })

  await ctx.close()
})
