import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"
import { dayKey } from "../lib/training-format"
import { undoChangeSet } from "../lib/ai/apply"
import { whoApplied } from "../lib/ai/who"

/** Ask AI on the client's own Today page: gated by the coach's switch, paid by the coach. */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })
let coachId = ""
let clientId = ""
const PREFIX = "AIC "

async function signInAsClient(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

async function seedSession(name: string) {
  const d = new Date(`${dayKey(new Date())}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return prisma.workout.create({
    data: {
      clientId, name, scheduledDate: d, dayOfWeek: d.getUTCDay(), order: 1, isCompleted: false,
      exercises: { create: [{ name: "Back Squat", prescription: "3x5 @ RPE 7, rest 2 min", order: 1 }] },
    },
    include: { exercises: true },
  })
}

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  coachId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-coach@dev.local" } })).id
  clientId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })).id
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { tourSeenAt: new Date() } })
})
test.beforeEach(async () => {
  await prisma.aiThread.deleteMany({ where: { clientId } })
  await prisma.aiChangeSet.deleteMany({ where: { clientId } })
  await prisma.aiUsage.deleteMany({ where: { coachId } })
  await prisma.workout.deleteMany({ where: { clientId, name: { startsWith: PREFIX } } })
})
test.afterAll(async () => {
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: false } })
  await prisma.workout.deleteMany({ where: { clientId, name: { startsWith: PREFIX } } })
  await prisma.$disconnect()
})

test("no switch, no button", async ({ page }) => {
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: false } })
  await signInAsClient(page)
  await expect(page.getByRole("button", { name: /Ask AI/ })).toBeHidden()
})

test("switched on: the client asks, reviews, applies, and the batch is theirs", async ({ page }) => {
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: true } })
  const w = await seedSession(`${PREFIX}Mine`)
  const [squat] = w.exercises
  await page.route("**/api/ai/assist", async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    await route.fulfill({
      json: {
        reply: "Eased your squat.",
        changes: [{ action: "modify", workoutId: w.id, workoutName: w.name, date: dayKey(w.scheduledDate), exerciseId: squat.id, exercise: "Back Squat", currentPrescription: "3x5 @ RPE 7, rest 2 min", newPrescription: "3x5 @ RPE 6, rest 2 min", reason: "Knee" }],
        warnings: ["Tell your coach if the knee keeps hurting"], // a warning stops auto-apply, so the client reviews
        dropped: [], meter: { spent: 0.05, cap: 25, level: "ok" },
      },
    })
  })
  await signInAsClient(page)
  await page.getByRole("button", { name: /Ask AI about your training/ }).click()
  const dialog = page.getByRole("dialog", { name: "AI assistant" })
  await expect(dialog.getByText("About your training. Nothing changes until you apply it.")).toBeVisible()
  await expect(dialog.getByText(/AI spend this month/)).toBeHidden()
  await expect(dialog.getByText("My shoulder is irritated. No overhead work for two weeks.")).toBeVisible()
  await page.getByPlaceholder("Ask a question or describe a change").fill("My knee hurts")
  await page.getByRole("button", { name: "Send" }).click()
  await expect(page.getByText("Eased your squat.")).toBeVisible()
  await page.getByRole("button", { name: "Apply 1 change" }).click()
  await expect(page.getByText(/Applied 1 change to your calendar/)).toBeVisible()
  const set = await prisma.aiChangeSet.findFirstOrThrow({ where: { clientId }, orderBy: { createdAt: "desc" } })
  expect(set.appliedById).toBe(clientId)
  expect(set.coachId).toBe(coachId)
})

test("switched off while the panel is open: the next ask explains instead of going blank", async ({ page }) => {
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: true } })
  await signInAsClient(page)
  await page.getByRole("button", { name: /Ask AI about your training/ }).click()
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: false } })
  await page.getByPlaceholder("Ask a question or describe a change").fill("Anything")
  await page.getByRole("button", { name: "Send" }).click()
  await expect(page.getByText(/hasn't switched on Ask AI for you/)).toBeVisible()
})

test("the coach sees what the client changed and can undo it; a stranger coach cannot", async ({ page, browser }) => {
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canAskAi: true } })
  const w = await seedSession(`${PREFIX}Seen By Coach`)
  const [squat] = w.exercises
  await signInAsClient(page)
  const res = await page.request.post("/api/ai/assist/apply", {
    data: { clientId, request: "Make my squat lighter please", changes: [{ action: "modify", workoutId: w.id, exerciseId: squat.id, newPrescription: "3x5 @ RPE 6" }] },
  })
  expect(res.status()).toBe(200)

  const coach = await browser.newContext({ storageState: "./.auth/coach.json" })
  const cp = await coach.newPage()
  await cp.goto(`/coach/clients/${clientId}`)
  const strip = cp.getByTestId("recent-ai-changes")
  await expect(strip).toContainText("Recent AI changes")
  await expect(strip).toContainText("Playwright") // the client's first name
  await expect(strip).toContainText("Make my squat lighter please")
  await expect(strip).toContainText("1 edit")
  await strip.getByRole("button", { name: "Undo" }).click()
  await expect(strip).toContainText("Undone")
  await expect.poll(async () => (await prisma.workoutExercise.findUniqueOrThrow({ where: { id: squat.id } })).prescription).toBe("3x5 @ RPE 7, rest 2 min")
  await coach.close()

  // Someone who is not this client's coach cannot undo their batch.
  const again = await page.request.post("/api/ai/assist/apply", {
    data: { clientId, request: "again", changes: [{ action: "modify", workoutId: w.id, exerciseId: squat.id, newPrescription: "3x5 @ RPE 6" }] },
  })
  const { changeSetId: id2 } = await again.json()
  const stranger = await prisma.user.upsert({
    where: { email: "playwright-stranger-coach@dev.local" },
    update: {},
    create: { email: "playwright-stranger-coach@dev.local", name: "Stranger", role: "COACH", hashedPassword: "x", coachProfile: { create: {} } },
  })
  const r = await undoChangeSet(stranger.id, id2)
  expect(r.ok).toBe(false)
})

test("the strip names who applied: you, the client, or another coach", () => {
  const args = { clientId: "c1", viewerId: "coachA", clientFirst: "Sasha" }
  expect(whoApplied({ appliedById: null, ...args })).toBe("you") // rows from before the column: coach-applied
  expect(whoApplied({ appliedById: "coachA", ...args })).toBe("you")
  expect(whoApplied({ appliedById: "c1", ...args })).toBe("Sasha")
  expect(whoApplied({ appliedById: "coachB", ...args })).toBe("another coach")
})
