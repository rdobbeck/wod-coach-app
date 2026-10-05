import { test, expect } from "@playwright/test"

/**
 * Client pages show a loading screen the moment they're opened, so a slow
 * server (a cold start after a deploy) never looks like a dead app. The
 * streamed page carries the loading markup first, then swaps in the real page.
 */
test("Today streams a loading screen first, then the real page", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })

  const html = await (await page.request.get("/client")).text()
  expect(html).toContain('data-testid="client-loading"')

  // Once loaded, the loading screen is gone and Today is there.
  await page.goto("/client")
  await expect(page.getByTestId("client-loading")).toHaveCount(0)
  await expect(page.getByRole("navigation")).toBeVisible()
  await ctx.close()
})
