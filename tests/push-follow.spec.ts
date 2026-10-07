import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"

/**
 * One phone, one push registration, owned by whoever is signed in. Headless
 * Chromium can't subscribe to a real push service, so the browser side is
 * faked: permission granted and a subscription already on the device. What's
 * under test is the rule: opening the app as another account moves the
 * registration to them, and a phone without notifications is left alone.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })
const ENDPOINT = "https://push.example.test/playwright-follow-device"
let coachId = ""
let clientId = ""

test.beforeAll(async () => {
  coachId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-coach@dev.local" } })).id
  clientId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })).id
  await prisma.pushSubscription.deleteMany({ where: { endpoint: ENDPOINT } })
})
test.afterAll(async () => {
  await prisma.pushSubscription.deleteMany({ where: { endpoint: ENDPOINT } })
  await prisma.$disconnect()
})

const owner = async () => (await prisma.pushSubscription.findUnique({ where: { endpoint: ENDPOINT } }))?.userId ?? null

/** A phone that has notifications on: permission granted, a subscription already registered with the browser. */
async function fakePhone(page: Page, permission: NotificationPermission) {
  await page.addInitScript(
    ({ endpoint, permission }) => {
      Object.defineProperty(Notification, "permission", { configurable: true, get: () => permission })
      const sub = { endpoint, toJSON: () => ({ endpoint, keys: { p256dh: "p256dh-test", auth: "auth-test" } }) }
      navigator.serviceWorker.getRegistration = async () => ({ pushManager: { getSubscription: async () => sub } }) as unknown as ServiceWorkerRegistration
    },
    { endpoint: ENDPOINT, permission }
  )
}

async function signInAsClient(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client/, { timeout: 15_000 })
}

test("opening the app moves the phone's registration to the signed-in account", async ({ browser }) => {
  // Coach (the project's saved session) opens the app on this phone.
  const coachCtx = await browser.newContext({ storageState: ".auth/coach.json" })
  const coachPage = await coachCtx.newPage()
  await fakePhone(coachPage, "granted")
  await coachPage.goto("/coach")
  await expect.poll(owner, { timeout: 10_000 }).toBe(coachId)
  await coachCtx.close()

  // Then the client signs in on the same phone: the registration follows them.
  const clientCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const clientPage = await clientCtx.newPage()
  await fakePhone(clientPage, "granted")
  await signInAsClient(clientPage)
  await expect.poll(owner, { timeout: 10_000 }).toBe(clientId)
  await clientCtx.close()
})

test("a phone that never turned notifications on is left alone", async ({ browser }) => {
  await prisma.pushSubscription.deleteMany({ where: { endpoint: ENDPOINT } })
  const ctx = await browser.newContext({ storageState: ".auth/coach.json" })
  const page = await ctx.newPage()
  await fakePhone(page, "default")
  await page.goto("/coach")
  await page.waitForTimeout(2000)
  expect(await owner()).toBeNull()
  await ctx.close()
})
