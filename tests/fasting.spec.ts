import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"

/**
 * The fasting timer: the coach offers it, and the client can switch their own
 * off and back on without losing the setting.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })

const CLIENT_EMAIL = "playwright-client@dev.local"
const CLIENT_PASSWORD = "playwright-test-PW-1"
let clientId = ""

test.beforeAll(async () => {
  const client = await prisma.user.findUniqueOrThrow({ where: { email: CLIENT_EMAIL } })
  clientId = client.id
  await prisma.clientProfile.update({
    where: { userId: clientId },
    data: { fastingOffered: true, fastingEnabled: true },
  })
  await prisma.fastLog.deleteMany({ where: { userId: clientId } })
})

test.afterAll(async () => {
  await prisma.clientProfile.update({
    where: { userId: clientId },
    data: { fastingOffered: false, fastingEnabled: false },
  })
  await prisma.$disconnect()
})

async function signInAsClient(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill(CLIENT_EMAIL)
  await page.locator('input[name="password"]').fill(CLIENT_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

test("a client can switch their fasting timer off and back on", async ({ browser, page }) => {
  // Two contexts and several cold route compiles, so the default 30s is tight.
  test.setTimeout(90_000)
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const clientPage = await ctx.newPage()
  await signInAsClient(clientPage)

  // On: the timer card is on Today and the window controls are in Settings.
  await expect(clientPage.getByText("Start fast")).toBeVisible()
  await clientPage.goto("/client/profile")
  const toggle = clientPage.getByRole("switch", { name: "Fasting timer" })
  await expect(toggle).toHaveAttribute("aria-checked", "true")
  await expect(clientPage.getByText("Eating window opens")).toBeVisible()

  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-checked", "false")
  await expect(clientPage.getByText("Eating window opens")).toBeHidden()
  expect(
    (await prisma.clientProfile.findUniqueOrThrow({ where: { userId: clientId } })).fastingEnabled
  ).toBe(false)

  // Off: the card is gone from Today, but the switch is still reachable.
  await clientPage.goto("/client")
  await expect(clientPage.getByText("Start fast")).toBeHidden()
  await clientPage.goto("/client/profile")
  await expect(clientPage.getByRole("switch", { name: "Fasting timer" })).toBeVisible()

  // The coach sees that the client switched theirs off.
  await page.goto(`/coach/clients/${clientId}`)
  await expect(page.getByText("Client switched theirs off")).toBeVisible()

  // Back on.
  await clientPage.getByRole("switch", { name: "Fasting timer" }).click()
  await expect(clientPage.getByRole("switch", { name: "Fasting timer" })).toHaveAttribute("aria-checked", "true")
  await clientPage.goto("/client")
  await expect(clientPage.getByText("Start fast")).toBeVisible()

  await ctx.close()
})

test("a client cannot switch on a timer their coach never offered", async ({ browser }) => {
  await prisma.clientProfile.update({
    where: { userId: clientId },
    data: { fastingOffered: false, fastingEnabled: false },
  })
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const clientPage = await ctx.newPage()
  await signInAsClient(clientPage)

  await clientPage.goto("/client/profile")
  await expect(clientPage.getByRole("switch", { name: "Fasting timer" })).toBeHidden()

  // The API refuses it too, not just the missing button: the flag is dropped,
  // which leaves nothing to update.
  const res = await clientPage.request.patch("/api/client/settings", { data: { fastingEnabled: true } })
  expect(res.status()).toBe(400)
  expect(
    (await prisma.clientProfile.findUniqueOrThrow({ where: { userId: clientId } })).fastingEnabled
  ).toBe(false)

  await ctx.close()
})

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`

async function freshFaster() {
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { fastingOffered: true, fastingEnabled: true, fastingProtocol: "16:8", fastingTargetHours: 16 } })
  await prisma.fastLog.deleteMany({ where: { userId: clientId } })
}

test("a client can set when their fast actually started, and the timer counts from there", async ({ browser }) => {
  await freshFaster()
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signInAsClient(page)

  await page.getByRole("button", { name: "Start fast" }).click()
  await expect(page.getByRole("button", { name: "I ate" })).toBeVisible()

  // They actually stopped eating six hours ago.
  const sixAgo = new Date(Date.now() - 6 * 3_600_000)
  sixAgo.setSeconds(0, 0)
  await page.getByLabel("Started at").fill(hhmm(sixAgo))

  await expect(page.getByText(/^6h 0[01]m$/)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/(10h 00m|9h 59m) to 16h/)).toBeVisible()

  const fast = await prisma.fastLog.findFirstOrThrow({ where: { userId: clientId, endedAt: null } })
  expect(Math.abs(fast.startedAt.getTime() - sixAgo.getTime())).toBeLessThan(60_000)
  await ctx.close()
})

test("a fast cannot have started in the future or more than a day ago", async ({ browser }) => {
  await freshFaster()
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signInAsClient(page)
  await page.request.post("/api/fasts", { data: { action: "start" } })

  const future = await page.request.post("/api/fasts", { data: { action: "adjust", startedAt: new Date(Date.now() + 3_600_000).toISOString() } })
  expect(future.status()).toBe(400)
  const tooOld = await page.request.post("/api/fasts", { data: { action: "adjust", startedAt: new Date(Date.now() - 30 * 3_600_000).toISOString() } })
  expect(tooOld.status()).toBe(400)
  const fine = await page.request.post("/api/fasts", { data: { action: "adjust", startedAt: new Date(Date.now() - 2 * 3_600_000).toISOString() } })
  expect(fine.ok()).toBe(true)
  await ctx.close()
})
