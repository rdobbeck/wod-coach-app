import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"
import { THEMES, resolveTheme } from "../lib/themes"

/** Six looks to pick from, saved to the profile so they follow the client. */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })

let clientId = ""

test.beforeAll(async () => {
  const client = await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })
  clientId = client.id
})

test.afterAll(async () => {
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { theme: "dark" } })
  await prisma.$disconnect()
})

async function signIn(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

test("an unknown theme falls back instead of rendering a colourless app", () => {
  expect(resolveTheme("midnight")).toBe("midnight")
  expect(resolveTheme("chartreuse")).toBe("dark")
  expect(resolveTheme(null)).toBe("dark")
  expect(THEMES.length).toBeGreaterThanOrEqual(6)
})

test("picking a look saves it and repaints the app", async ({ browser }) => {
  test.setTimeout(60_000)
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signIn(page)
  await page.goto("/client/profile")

  await page.getByRole("button", { name: /Midnight/ }).click()

  // The shell carries the choice, which is what the CSS variables key off.
  await expect(page.locator("[data-app-theme]").first()).toHaveAttribute("data-app-theme", "midnight", { timeout: 15_000 })
  expect((await prisma.clientProfile.findUniqueOrThrow({ where: { userId: clientId } })).theme).toBe("midnight")

  // And it is still there on the next page, not just this one.
  await page.goto("/client")
  await expect(page.locator("[data-app-theme]").first()).toHaveAttribute("data-app-theme", "midnight")

  // Every look in the picker is a look the app actually knows how to render.
  const accent = await page.evaluate(() => getComputedStyle(document.querySelector("[data-app-theme]")!).getPropertyValue("--app-accent").trim())
  expect(accent).toBe("#3f8cff")

  await ctx.close()
})

test("a made-up theme is refused", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signIn(page)

  const res = await page.request.patch("/api/client/settings", { data: { theme: "neon-hotdog" } })
  expect(res.status()).toBe(400)
  await ctx.close()
})
