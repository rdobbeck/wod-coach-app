import { test as setup, expect } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { dbUrl } from "../lib/db-url"

/**
 * Idempotent COACH signup/signin. Saves an authenticated storage state so
 * downstream tests can hit /coach/* without re-authenticating.
 *
 * Test user is deterministic so re-running this suite reuses the same row
 * in the User table rather than polluting it with one user per run.
 */
const STORAGE_STATE = ".auth/coach.json"
const TEST_EMAIL = "playwright-coach@dev.local"
const TEST_PASSWORD = "playwright-test-PW-1"
const TEST_NAME = "Playwright Coach"

setup("authenticate as coach", async ({ page, request, baseURL }) => {
  mkdirSync(dirname(STORAGE_STATE), { recursive: true })

  // Try to create the test user. If it already exists, the endpoint returns
  // 4xx; we ignore that and fall through to signin.
  await request.post(`${baseURL}/api/auth/signup`, {
    data: {
      name: TEST_NAME,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      role: "COACH",
      startedAt: Date.now() - 5_000, // the signup bot check wants a form that was open a moment
    },
    failOnStatusCode: false,
  })

  // Sign in via the credentials form (NextAuth's default flow).
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill(TEST_EMAIL)
  await page.locator('input[name="password"]').fill(TEST_PASSWORD)
  await page.locator('button[type="submit"]').click()

  // The signin page sends users to "/", which redirects signed-in coaches to
  // /coach (a COACH-only page), so landing there proves the session is real.
  await page.waitForURL(/\/coach$/, { timeout: 10_000 })
  // The dashboard greets the coach by name (Good morning, Playwright).
  await expect(page.locator("h1")).toContainText(/good (morning|afternoon|evening), playwright/i)

  await page.context().storageState({ path: STORAGE_STATE })

  // The AI specs rely on the test coach's trial plan, which runs from the
  // profile's creation date. Left alone it expires two weeks after the row
  // was first seeded and every AI test starts failing with AI_FUNDS.
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })
  await prisma.coachProfile.updateMany({ where: { user: { email: TEST_EMAIL } }, data: { createdAt: new Date() } })
  await prisma.$disconnect()
})
