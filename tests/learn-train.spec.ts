import { test, expect, type Browser, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { dbUrl } from "../lib/db-url"

/**
 * Train it and Muscles worked: drafted muscles on new exercises, Ryan's review screen, Train it on
 * Learn cards, and muscle chips in a client's session. Runs against the preview database after
 * `scripts/add-exercise-muscles.ts preview --apply`. Every row it makes starts with PREFIX.
 */
test.use({ storageState: { cookies: [], origins: [] } })
// The muscles scene is the largest Learn model and renders in software WebGL here; the review tests
// load several pages each. 90 s per test keeps a busy machine from failing them on time alone.
test.describe.configure({ timeout: 90_000 })

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
  await page.waitForURL(/\/coach\/library\/muscles$/)
  await expect(page.getByTestId("review-progress")).toHaveText(/^Reviewed \d+ of the \d+ most-used\.$/)

  await page.goto(`/coach/library/muscles?q=${encodeURIComponent(`${PREFIX}Review`)}`)
  const rows = page.getByTestId("review-row")
  await expect(rows).toHaveCount(2) // three library rows, two names
  const lift = rows.filter({ hasText: /review lift/i })
  await expect(lift.getByRole("button", { name: "Looks right" })).toBeVisible()
  // Close drops an unsaved edit: the button goes back to Looks right and the editor reopens unchanged.
  await lift.getByRole("button", { name: "Edit" }).click()
  await lift.getByRole("button", { name: "Hamstrings: off" }).click()
  await expect(lift.getByRole("button", { name: "Save" })).toBeVisible()
  await lift.getByRole("button", { name: "Close" }).click()
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

const ready = (page: Page) => page.waitForFunction(() => window.__wodLearn?.ready === true, null, { timeout: 90_000 })
// The first selection or highlight on a scene compiles the viewer's fade shaders. In software WebGL
// on a busy machine that holds the page's main thread for seconds, so Train it renders its answer late.
const AFTER_FIRST_SELECT = { timeout: 20_000 }

test("muscles scene: gluteus maximus shows Train it: Glutes, a video opens the player, and a face muscle shows none", async ({ page }) => {
  await page.goto("/learn/muscles")
  await ready(page)
  await page.evaluate(() => window.__wodLearn?.select("gluteus-maximus-muscle"))
  const train = page.getByTestId("train-it")
  await expect(train).toContainText("Train it: Glutes", AFTER_FIRST_SELECT)
  const first = train.getByRole("button", { name: /^Play .+ video$/ }).first()
  const title = (await first.getAttribute("aria-label"))!.replace(/^Play (.+) video$/, "$1")
  await first.click()
  await expect(page.getByRole("dialog", { name: `${title} video` })).toBeVisible()
  await page.getByRole("button", { name: "Close video" }).click()

  await page.evaluate(() => window.__wodLearn?.select("frontalis-muscle")) // in no training group
  await expect(page.getByTestId("structure-card")).toContainText("Frontalis")
  await expect(page.getByTestId("train-it")).toHaveCount(0)
})

test("client Learn pages show Train it too: rectus femoris on the knee is Quads", async ({ browser }) => {
  const { ctx, page } = await signIn(browser, CLIENT)
  await page.goto("/client/learn/knee")
  await ready(page)
  await page.evaluate(() => window.__wodLearn?.select("rectus-femoris-muscle"))
  await expect(page.getByTestId("train-it")).toContainText("Train it: Quads", AFTER_FIRST_SELECT)
  await ctx.close()
})

test("Train it failing to load says so in one line and the card keeps working", async ({ page }) => {
  await page.route("**/api/learn/train**", (route) => route.abort())
  await page.goto("/learn/muscles")
  await ready(page)
  await page.evaluate(() => window.__wodLearn?.select("gluteus-maximus-muscle"))
  await expect(page.getByTestId("train-it-error")).toHaveText("Couldn't load exercises right now.", AFTER_FIRST_SELECT)
  await expect(page.getByTestId("train-it-loading")).toHaveCount(0)
  await expect(page.getByTestId("structure-card")).toContainText("Gluteus maximus")
})

test("a group with no exercises shows no Train it section at all", async ({ page }) => {
  await page.route("**/api/learn/train**", (route) => route.fulfill({ json: { group: "glutes", label: "Glutes", exercises: [] } }))
  await page.goto("/learn/muscles")
  await ready(page)
  const answered = page.waitForResponse("**/api/learn/train**")
  await page.evaluate(() => window.__wodLearn?.select("gluteus-maximus-muscle"))
  await answered
  await expect(page.getByTestId("structure-card")).toContainText("Gluteus maximus")
  await expect(page.getByTestId("train-it-loading")).toHaveCount(0, AFTER_FIRST_SELECT)
  await expect(page.getByTestId("train-it")).toHaveCount(0)
})

test("Muscles worked: the link's groups are lit and listed, each opens its Train it, a tap still selects, and Show all muscles clears it", async ({ page }) => {
  await page.goto("/learn/muscles?highlight=glutes&also=hamstrings&from=Hip%20Thrust")
  await ready(page)
  const worked = page.getByTestId("muscles-worked")
  await expect(worked).toContainText("Muscles worked by Hip Thrust")
  await expect(worked.getByRole("button", { name: "Glutes Main" })).toBeVisible()
  await expect(worked.getByRole("button", { name: "Hamstrings Also" })).toBeVisible()
  await expect(page.getByTestId("structure-card")).toHaveCount(0) // Muscles worked takes the card's place
  const glow = (id: string) => page.evaluate((i) => window.__wodLearn?.glow(i), id)
  await expect.poll(() => glow("gluteus-maximus-muscle")).toBe(1)
  await expect.poll(() => glow("semitendinosus-muscle")).toBe(0.5)
  await expect.poll(() => glow("vastus-lateralis-muscle")).toBe(0)

  await worked.getByRole("button", { name: "Glutes Main" }).click()
  await expect(worked.getByTestId("train-it")).toContainText("Train it: Glutes", AFTER_FIRST_SELECT)

  await page.evaluate(() => window.__wodLearn?.select("vastus-lateralis-muscle"))
  await expect(page.getByTestId("structure-card")).toContainText("Vastus lateralis")
  await expect.poll(() => glow("vastus-lateralis-muscle")).toBe(1)
  await expect.poll(() => glow("gluteus-maximus-muscle")).toBe(0)

  await worked.getByRole("button", { name: "Show all muscles" }).click()
  // The app router updates the URL once the page data arrives; a busy dev server takes a few seconds.
  await expect(page).toHaveURL(/\/learn\/muscles$/, { timeout: 15_000 })
  await expect(page.getByTestId("muscles-worked")).toHaveCount(0)
})

test.describe("Muscles worked chips in a client's session", () => {
  const WORKOUT = `${PREFIX}Session`
  let clientId = ""
  let workoutId = ""

  test.beforeAll(async () => {
    clientId = (await prisma.user.findUniqueOrThrow({ where: { email: CLIENT.email } })).id
    await prisma.clientProfile.update({ where: { userId: clientId }, data: { tourSeenAt: new Date() } })
    await prisma.workout.deleteMany({ where: { clientId, name: WORKOUT } })
    const lift = { category: "Custom", difficulty: "Any" }
    const rdl = await prisma.exerciseLibrary.create({
      data: { ...lift, name: `${PREFIX}Romanian Deadlift`, videoUrl: "https://youtu.be/ddddddddddd", primaryMuscles: ["glutes", "hamstrings"], secondaryMuscles: ["lower-back"] },
    })
    await prisma.exerciseLibrary.create({
      data: { ...lift, name: `${PREFIX}Hip Thrust Chips`, videoUrl: "https://youtu.be/eeeeeeeeeee", primaryMuscles: ["glutes"], secondaryMuscles: ["side-glutes", "hamstrings"] },
    })
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z")
    const w = await prisma.workout.create({
      data: {
        clientId, name: WORKOUT, scheduledDate: today, dayOfWeek: today.getUTCDay(), order: 1,
        exercises: {
          create: [
            { name: `${PREFIX}Romanian Deadlift`, exerciseId: rdl.id, prescription: "3x8", order: 1 },
            { name: "pw train hip thrust chips", prescription: "3x10", order: 2 }, // unlinked; the library spells it in title case
            { name: `${PREFIX}Mystery Drill`, prescription: "2x5", order: 3 }, // unlinked, no library match
          ],
        },
      },
    })
    workoutId = w.id
  })

  test.afterAll(async () => {
    await prisma.workout.deleteMany({ where: { clientId, name: WORKOUT } })
  })

  test("each tagged exercise shows its main muscles, and a chip opens Learn with them lit", async ({ browser }) => {
    const { ctx, page } = await signIn(browser, CLIENT)
    await page.goto(`/client/workouts/${workoutId}`)
    const row = (name: string) => page.locator("li", { has: page.getByText(name, { exact: true }) })
    await expect(row(`${PREFIX}Romanian Deadlift`).getByTestId("muscle-chips")).toContainText("Glutes · Hamstrings")
    const borrowed = row("pw train hip thrust chips").getByTestId("muscle-chips")
    await expect(borrowed).toContainText("Glutes")
    await expect(borrowed).toHaveAttribute("href", "/client/learn/muscles?highlight=glutes&also=side-glutes%2Chamstrings&from=pw+train+hip+thrust+chips")
    await expect(row(`${PREFIX}Mystery Drill`).getByTestId("muscle-chips")).toHaveCount(0)

    await row(`${PREFIX}Romanian Deadlift`).getByTestId("muscle-chips").click()
    await page.waitForURL(/\/client\/learn\/muscles\?highlight=glutes%2Chamstrings&also=lower-back&from=/)
    await expect(page.getByTestId("muscles-worked")).toContainText(`Muscles worked by ${PREFIX}Romanian Deadlift`)
    await ctx.close()
  })
})
