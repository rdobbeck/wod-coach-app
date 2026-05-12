import { test as setup, expect } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

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
    },
    failOnStatusCode: false,
  })

  // Sign in via the credentials form (NextAuth's default flow).
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill(TEST_EMAIL)
  await page.locator('input[name="password"]').fill(TEST_PASSWORD)
  await page.locator('button[type="submit"]').click()

  // The signin page redirects to "/" after success; the home page doesn't
  // auto-redirect coaches but shows a "Welcome back" banner. Wait for the
  // post-signin home state, then verify the session is real by visiting
  // /coach (which requires a COACH session).
  await page.waitForURL(/localhost:\d+\/(?:\?.*)?$/, { timeout: 10_000 })
  await expect(page.locator("body")).toContainText(/welcome back/i)
  await page.goto("/coach")
  await expect(page.locator("h1")).toContainText(/coach dashboard/i)

  await page.context().storageState({ path: STORAGE_STATE })
})
