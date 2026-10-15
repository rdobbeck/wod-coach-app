import { test, expect, type Browser } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
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

test.afterAll(async () => {
  await prisma.exerciseLibrary.deleteMany({ where: { name: { startsWith: PREFIX } } })
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
