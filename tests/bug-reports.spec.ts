import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { dbUrl } from "../lib/db-url"
import { digestText } from "../lib/bug-reports"

/**
 * Report a problem: a client files one from Settings (text, screenshot paths,
 * where they were), the coach sees it on /coach/bugs and on the dashboard,
 * resolves it, and the morning digest only nags about open ones.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })

const CLIENT_EMAIL = "playwright-bugs-client@dev.local"
const CLIENT_PASSWORD = "playwright-test-PW-1"
const COACH_EMAIL = "playwright-coach@dev.local"

let clientId = ""
let coachId = ""

// A 1x1 transparent PNG: enough to go through the signed-upload path for real.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64")

test.beforeAll(async () => {
  const coach = await prisma.user.findUniqueOrThrow({ where: { email: COACH_EMAIL } })
  coachId = coach.id
  const client = await prisma.user.upsert({
    where: { email: CLIENT_EMAIL },
    update: {},
    create: {
      email: CLIENT_EMAIL,
      name: "Bugs Client",
      role: "CLIENT",
      hashedPassword: await bcrypt.hash(CLIENT_PASSWORD, 10),
      clientProfile: { create: { tourSeenAt: new Date() } },
    },
  })
  clientId = client.id
  await prisma.clientCoach.upsert({
    where: { clientId_coachId: { clientId, coachId } },
    update: { status: "ACTIVE" },
    create: { clientId, coachId, status: "ACTIVE" },
  })
  await prisma.bugReport.deleteMany({ where: { userId: clientId } })
})

test.afterAll(async () => {
  await prisma.bugReport.deleteMany({ where: { userId: clientId } })
  await prisma.$disconnect()
})

async function signInAsClient(page: Page) {
  await page.context().clearCookies()
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill(CLIENT_EMAIL)
  await page.locator('input[name="password"]').fill(CLIENT_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client/)
}

test("digest text: nothing open stays quiet; open ones list who, how old, and the first line", () => {
  expect(digestText([])).toBeNull()
  const now = new Date("2026-10-06T13:00:00Z")
  const text = digestText(
    [
      { body: "Timer keeps resetting\nsecond line", createdAt: new Date("2026-10-04T10:00:00Z"), user: { name: "Kevin", email: null } },
      { body: "", createdAt: new Date("2026-10-06T08:00:00Z"), user: { name: null, email: "m@x.com" } },
    ],
    now
  )
  expect(text).toBe("Kevin (2 days): Timer keeps resetting\nm@x.com (today): (screenshot only)\nwod.coach/coach/bugs")
})

test("client: Settings has Report a problem; sending stores text, page and device, and rejects foreign screenshot paths", async ({ page }) => {
  await signInAsClient(page)
  await page.goto("/client/profile")
  await page.getByTestId("report-problem").click()
  await expect(page).toHaveURL(/\/client\/report\?from=(\/|%2F)client(\/|%2F)profile/)
  await expect(page.getByRole("heading", { name: "Report a problem" })).toBeVisible()

  // Empty form: told to add something, nothing stored.
  await page.getByTestId("bug-report-send").click()
  await expect(page.getByTestId("bug-report-error")).toContainText("Tell us what happened")
  expect(await prisma.bugReport.count({ where: { userId: clientId } })).toBe(0)

  await page.getByTestId("bug-report-body").fill("The rest timer jumps to zero when I lock my phone")
  // A real image through the private bucket, the same pipeline session comments use.
  await page.getByTestId("bug-report-file").setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: PNG })
  await expect(page.getByRole("button", { name: "Remove screenshot" })).toBeVisible()
  await page.getByTestId("bug-report-send").click()
  await expect(page.getByTestId("bug-report-sent")).toBeVisible({ timeout: 20_000 })

  const row = await prisma.bugReport.findFirstOrThrow({ where: { userId: clientId } })
  expect(row.body).toBe("The rest timer jumps to zero when I lock my phone")
  expect(row.path).toBe("/client/profile")
  expect(row.userAgent).toContain("Chrome")
  expect(row.viewport).toMatch(/^\d+x\d+$/)
  expect(row.resolvedAt).toBeNull()
  expect(row.screenshots).toHaveLength(1)
  expect(row.screenshots[0]).toMatch(new RegExp(`^${clientId}/.+\\.png$`))

  // Screenshot paths must live under the client's own folder; anything else is dropped.
  const res = await page.request.post("/api/bug-reports", {
    data: { body: "with shots", screenshots: [`${clientId}/a.jpg`, "someone-else/b.jpg", `${clientId}/c.jpg`] },
  })
  expect(res.ok()).toBeTruthy()
  const shots = await prisma.bugReport.findFirstOrThrow({ where: { userId: clientId, body: "with shots" } })
  expect(shots.screenshots).toEqual([`${clientId}/a.jpg`, `${clientId}/c.jpg`])

  // A client can't resolve reports.
  const patch = await page.request.patch("/api/bug-reports", { data: { id: row.id, resolved: true } })
  expect(patch.status()).toBe(401)
})

test("coach: open reports show on the dashboard and /coach/bugs; resolving moves them out of the open pile", async ({ page }) => {
  const open = await prisma.bugReport.create({
    data: { userId: clientId, body: "Workout page is blank on Tuesdays", path: "/client/workouts" },
  })

  await page.goto("/coach")
  await expect(page.getByText("Bugs Client reported a problem").first()).toBeVisible()
  await expect(page.getByText("Workout page is blank on Tuesdays")).toBeVisible()

  await page.goto("/coach/bugs")
  const card = page.getByTestId("bug-report").filter({ hasText: "Workout page is blank on Tuesdays" })
  await expect(card).toBeVisible()
  await expect(card).toContainText("on /client/workouts")
  // The screenshot the client test uploaded renders through a signed URL.
  const withShot = page.getByTestId("bug-report").filter({ hasText: "rest timer jumps to zero" })
  await expect(withShot.getByRole("img", { name: "Screenshot" })).toBeVisible()
  await card.getByTestId("bug-resolve").click()
  await expect(card.getByTestId("bug-reopen")).toBeVisible()

  const after = await prisma.bugReport.findUniqueOrThrow({ where: { id: open.id } })
  expect(after.resolvedAt).not.toBeNull()

  await page.goto("/coach")
  await expect(page.getByText("Workout page is blank on Tuesdays")).toHaveCount(0)

  // Digest: unauthenticated callers get nothing; the secret is checked server-side.
  const bare = await page.request.get("/api/bug-reports/digest")
  expect(bare.status()).toBe(401)
})
