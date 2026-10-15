import { test, expect, type Browser } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { dbUrl } from "../lib/db-url"

/**
 * Train it and Muscles worked: drafted muscles on new exercises, Ryan's review screen, Train it on
 * Learn cards, and muscle chips in a client's session. Runs against the preview database after
 * `scripts/add-exercise-muscles.ts preview --apply`. Every row it makes starts with PREFIX.
 */
test.use({ storageState: { cookies: [], origins: [] } })

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })
const PREFIX = "PW Train "
const COACH = { email: "playwright-coach@dev.local", password: "playwright-test-PW-1" }
const CLIENT = { email: "playwright-client@dev.local", password: "playwright-test-PW-1" }

/** A fresh signed-in browser context; close it at the end of the test. */
async function signIn(browser: Browser, who: { email: string; password: string }) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill(who.email)
  await page.locator('input[name="password"]').fill(who.password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/(coach|client)/, { timeout: 15_000 })
  return { ctx, page }
}

// Some rows are spelled in lower case on purpose (same-name duplicates). Cleaned before too, so a
// run that crashed halfway never leaves rows that change the next run's review queue.
const cleanUp = () => prisma.exerciseLibrary.deleteMany({ where: { name: { startsWith: PREFIX, mode: "insensitive" } } })
test.beforeAll(async () => {
  await cleanUp()
})
test.afterAll(async () => {
  await cleanUp()
  await prisma.$disconnect()
})

test("new library exercises get drafted muscles from their name, unreviewed, on both create paths", async ({ browser }) => {
  const { ctx, page } = await signIn(browser, COACH)
  const added = await page.request.post("/api/exercises", { data: { name: `${PREFIX}Goblet Squat`, videoUrl: "https://youtu.be/aaaaaaaaaaa" } })
  expect(added.ok()).toBe(true)
  const squat = await prisma.exerciseLibrary.findFirstOrThrow({ where: { name: `${PREFIX}Goblet Squat` } })
  expect(squat.primaryMuscles).toEqual(["glutes", "quads"])
  expect(squat.secondaryMuscles).toEqual(["lower-back", "adductors"])
  expect(squat.musclesReviewedAt).toBeNull()

  // The AI library builder's save path (the Playwright coach is on LIBRARY_AI_COACH_EMAILS).
  const saved = await page.request.post("/api/library/ai/save", {
    data: { entries: [{ name: `${PREFIX}Hip Thrust`, videoUrl: "https://youtu.be/bbbbbbbbbbb", thumbnailUrl: null, patterns: [], equipment: [], cues: "", summary: "" }] },
  })
  expect((await saved.json()).failed).toEqual([])
  const thrust = await prisma.exerciseLibrary.findFirstOrThrow({ where: { name: `${PREFIX}Hip Thrust` } })
  expect(thrust.primaryMuscles).toEqual(["glutes"])
  expect(thrust.secondaryMuscles).toEqual(["side-glutes", "hamstrings"])
  await ctx.close()
})

test("Train it API: up to six exercises with videos for a group, cached at the edge; unknown groups are a 404", async ({ request }) => {
  const res = await request.get("/api/learn/train?group=glutes")
  expect(res.status()).toBe(200)
  expect(res.headers()["cache-control"]).toBe("public, s-maxage=600, stale-while-revalidate=86400")
  const body = await res.json()
  expect(body).toMatchObject({ group: "glutes", label: "Glutes" })
  expect(body.exercises.length).toBeGreaterThan(0)
  expect(body.exercises.length).toBeLessThanOrEqual(6)
  expect(body.exercises[0]).toMatchObject({ role: "primary", videoUrl: expect.stringMatching(/^https?:\/\//) })
  for (const query of ["?group=quadriceps", "?group=", ""]) expect((await request.get(`/api/learn/train${query}`)).status()).toBe(404)
})

/** A coach who is neither an owner nor on the allowlist (the same account tests/library-ai.spec.ts uses). */
const STRANGER = { email: "playwright-libai-stranger@dev.local", password: "stranger-PW-1" }
async function ensureStranger() {
  await prisma.user.upsert({
    where: { email: STRANGER.email },
    update: {},
    create: { email: STRANGER.email, name: "Stranger Coach", role: "COACH", hashedPassword: await bcrypt.hash(STRANGER.password, 10), coachProfile: { create: {} } },
  })
}

test("review screen: one row per name; a chip edit saves on every row with that name, and Looks right confirms", async ({ browser }) => {
  const base = { category: "Custom", difficulty: "Any", videoUrl: "https://youtu.be/ccccccccccc", primaryMuscles: ["glutes"] }
  const a = await prisma.exerciseLibrary.create({ data: { ...base, name: `${PREFIX}Review Lift` } })
  const b = await prisma.exerciseLibrary.create({ data: { ...base, name: `${PREFIX.toLowerCase()}review lift` } })
  const hold = await prisma.exerciseLibrary.create({ data: { ...base, name: `${PREFIX}Review Hold`, primaryMuscles: ["abs"] } })
  const { ctx, page } = await signIn(browser, COACH)

  await page.goto("/coach/library")
  await page.getByRole("link", { name: "Review muscles" }).click()
  await expect(page).toHaveURL(/\/coach\/library\/muscles$/)
  await expect(page.getByTestId("review-progress")).toHaveText(/^Reviewed \d+ of the \d+ most-used\.$/)

  await page.goto(`/coach/library/muscles?q=${encodeURIComponent(`${PREFIX}Review`)}`)
  const rows = page.getByTestId("review-row")
  await expect(rows).toHaveCount(2) // three library rows, two names
  const lift = rows.filter({ hasText: /review lift/i })
  await expect(lift.getByRole("button", { name: "Looks right" })).toBeVisible()
  await lift.getByRole("button", { name: "Edit" }).click()
  await lift.getByRole("button", { name: "Hamstrings: off" }).click()
  await lift.getByRole("button", { name: "Hamstrings: primary" }).click()
  await expect(lift.getByRole("button", { name: "Hamstrings: secondary" })).toBeVisible()
  await lift.getByRole("button", { name: "Save" }).click()
  await expect(lift).toContainText("Reviewed")
  for (const id of [a.id, b.id]) {
    const r = await prisma.exerciseLibrary.findUniqueOrThrow({ where: { id } })
    expect([r.primaryMuscles, r.secondaryMuscles]).toEqual([["glutes"], ["hamstrings"]])
    expect(r.musclesReviewedAt).not.toBeNull()
  }

  const holdRow = rows.filter({ hasText: "Review Hold" })
  await holdRow.getByRole("button", { name: "Looks right" }).click()
  await expect(holdRow).toContainText("Reviewed")
  const h = await prisma.exerciseLibrary.findUniqueOrThrow({ where: { id: hold.id } })
  expect(h.primaryMuscles).toEqual(["abs"])
  expect(h.musclesReviewedAt).not.toBeNull()

  // The API refuses what the vocabulary does not know.
  const bad = await page.request.patch(`/api/exercises/${hold.id}/muscles`, { data: { primary: ["quadriceps"], secondary: [] } })
  expect(bad.status()).toBe(400)
  expect((await bad.json()).error).toBe('Unknown muscle group "quadriceps".')
  await ctx.close()
})

test("review screen and its API: a coach who is not an owner gets a 404 and a 401, and so does a client", async ({ browser }) => {
  await ensureStranger()
  const stranger = await signIn(browser, STRANGER)
  expect((await stranger.page.goto("/coach/library/muscles"))?.status()).toBe(404)
  expect((await stranger.page.request.patch("/api/exercises/any/muscles", { data: { primary: [], secondary: [] } })).status()).toBe(401)
  await stranger.page.goto("/coach/library")
  await expect(stranger.page.getByRole("heading", { name: "Exercise Library" })).toBeVisible()
  await expect(stranger.page.getByRole("link", { name: "Review muscles" })).toHaveCount(0)
  await stranger.ctx.close()

  const client = await signIn(browser, CLIENT)
  expect((await client.page.goto("/coach/library/muscles"))?.status()).toBe(404)
  expect((await client.page.request.patch("/api/exercises/any/muscles", { data: { primary: [], secondary: [] } })).status()).toBe(401)
  await client.ctx.close()
})
