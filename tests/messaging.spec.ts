import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { dbUrl } from "../lib/db-url"

/**
 * Coach <-> client messaging: the chat thread and per-workout comments, from
 * both sides. Seeds its own client so it never touches a real one.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })

const CLIENT_EMAIL = "playwright-client@dev.local"
const CLIENT_PASSWORD = "playwright-test-PW-1"
const COACH_EMAIL = "playwright-coach@dev.local"

let clientId = ""
let coachId = ""
let workoutId = ""

test.beforeAll(async () => {
  const coach = await prisma.user.findUniqueOrThrow({ where: { email: COACH_EMAIL } })
  coachId = coach.id

  const client = await prisma.user.upsert({
    where: { email: CLIENT_EMAIL },
    update: {},
    create: {
      email: CLIENT_EMAIL,
      name: "Playwright Client",
      role: "CLIENT",
      hashedPassword: await bcrypt.hash(CLIENT_PASSWORD, 10),
      // Seen, so the first-run tour never covers Today in the other specs.
      // tour.spec.ts clears it for itself and puts it back.
      clientProfile: { create: { tourSeenAt: new Date() } },
    },
  })
  clientId = client.id

  await prisma.clientCoach.upsert({
    where: { clientId_coachId: { clientId, coachId } },
    update: { status: "ACTIVE" },
    create: { clientId, coachId, status: "ACTIVE" },
  })

  // A clean slate each run, so assertions count only what this run wrote.
  await prisma.message.deleteMany({
    where: { OR: [{ senderId: clientId }, { receiverId: clientId }] },
  })
  await prisma.workout.deleteMany({ where: { clientId, name: "Playwright Session" } })
  const workout = await prisma.workout.create({
    data: {
      clientId,
      name: "Playwright Session",
      scheduledDate: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z"),
      dayOfWeek: new Date().getUTCDay(),
      order: 1,
      exercises: { create: [{ name: "Back Squat", prescription: "3 x 5", order: 1 }] },
    },
  })
  workoutId = workout.id
})

test.afterAll(async () => {
  await prisma.$disconnect()
})

/**
 * Type into a composer and send. Waits for Send to enable first: React only
 * enables it once hydrated, so this is what proves the handler is attached.
 */
async function compose(page: Page, placeholder: string | RegExp, text: string) {
  await page.getByPlaceholder(placeholder).fill(text)
  const send = page.getByRole("button", { name: "Send", exact: true })
  await expect(send).toBeEnabled()
  await send.click()
}

/** A sent message or comment, matched on the bubble rather than the textarea. */
const bubble = (page: Page, text: string) => page.getByRole("paragraph").filter({ hasText: text })

/** Sign in as the seeded client in a fresh context (tests default to the coach). */
async function signInAsClient(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill(CLIENT_EMAIL)
  await page.locator('input[name="password"]').fill(CLIENT_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

test("coach sends a message and the client sees and answers it", async ({ page, browser }) => {
  await page.goto(`/coach/clients/${clientId}/messages`)
  await compose(page, /^Message /, "Squat session looks good, go heavy.")
  await expect(bubble(page, "Squat session looks good, go heavy.")).toBeVisible()

  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const clientPage = await ctx.newPage()
  await signInAsClient(clientPage)

  // The unread badge shows on the Messages tab before the thread is opened.
  const tab = clientPage.getByRole("link", { name: /Messages/ })
  await expect(tab).toContainText("1")

  await tab.click()
  await clientPage.waitForURL(/\/client\/messages/)
  await expect(bubble(clientPage, "Squat session looks good, go heavy.")).toBeVisible()

  await compose(clientPage, /^Message /, "Copy that, will report back.")
  await expect(bubble(clientPage, "Copy that, will report back.")).toBeVisible()

  // Back on the coach side the reply is waiting, flagged unread.
  await page.goto(`/coach/clients/${clientId}`)
  await expect(page.getByRole("link", { name: /Messages/ })).toContainText("1")
  await page.goto(`/coach/clients/${clientId}/messages`)
  await expect(bubble(page, "Copy that, will report back.")).toBeVisible()

  await ctx.close()
})

test("comments on a workout are two-way", async ({ page, browser }) => {
  await page.goto(`/coach/clients/${clientId}/workouts/${workoutId}`)
  await compose(page, "Leave a note for your client", "Belt on for the top set.")
  await expect(bubble(page, "Belt on for the top set.")).toBeVisible()

  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const clientPage = await ctx.newPage()
  await signInAsClient(clientPage)
  await clientPage.goto(`/client/workouts/${workoutId}`)
  await expect(bubble(clientPage, "Belt on for the top set.")).toBeVisible()

  await compose(clientPage, "Ask your coach about this session", "Belt is in the car, got it.")
  await expect(bubble(clientPage, "Belt is in the car, got it.")).toBeVisible()

  // Reload proves it persisted rather than only living in React state.
  await clientPage.reload()
  await expect(bubble(clientPage, "Belt is in the car, got it.")).toBeVisible()

  await page.reload()
  await expect(bubble(page, "Belt is in the car, got it.")).toBeVisible()

  await ctx.close()
})
