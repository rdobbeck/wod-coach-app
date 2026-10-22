import { test, expect } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"
import { fromDayKey } from "../lib/training"
import { rankSwaps, patternsFromName, type SwapRow } from "../lib/swap"

/**
 * Swapping an exercise while the coach runs a session in person: suggestions
 * that train the same thing, and the swap itself without leaving the session.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })

const row = (id: string, name: string, patterns: string[], primary: string[], secondary: string[] = [], videoUrl: string | null = "https://youtu.be/x"): SwapRow => ({
  id, name, patterns, primary, secondary, videoUrl, equipment: [],
})
const LIB: SwapRow[] = [
  row("pu", "Pull-Up", ["Pull"], ["lats", "biceps"]),
  row("wpu", "Weighted Pull-Up", ["Pull"], ["lats", "biceps"]),
  row("spu", "Strict Pull-Up", ["Pull"], ["lats", "biceps"]),
  row("epu", "Eccentric Pull-Up", ["Pull"], ["lats", "biceps"]),
  row("rpu", "Rope Pull-Up", ["Pull"], ["lats", "biceps"]),
  row("lpd", "Lat Pulldown", ["Pull"], ["lats", "biceps"]),
  row("rr", "Ring Row", ["Pull"], ["lats", "upper-back"]),
  row("curl", "Biceps Curl", ["Pull"], ["biceps"]),
  row("sq", "Back Squat", ["Squat"], ["glutes", "quads"]),
  row("nov", "Lat Stretch", ["Mobility"], ["lats"]),
  row("novid", "Kipping Pull-Up Drill", ["Pull"], ["lats", "biceps"], [], null),
]

test("suggestions share a primary muscle and the pattern, have a video, and skip the exercise itself", () => {
  const s = rankSwaps({ name: "Pull-Up", id: "pu", patterns: ["Pull"], primary: ["lats", "biceps"], secondary: [] }, LIB, new Map([["lpd", 50]]))
  const ids = s.map((x) => x.id)
  expect(ids).not.toContain("pu")
  expect(ids).not.toContain("sq") // other muscles
  expect(ids).not.toContain("nov") // other pattern
  expect(ids).not.toContain("novid") // no video
  // What the coach programs most comes first; at most three versions of the same lift.
  expect(ids[0]).toBe("lpd")
  expect(ids.filter((i) => ["wpu", "spu", "epu", "rpu"].includes(i))).toHaveLength(3)
  expect(ids).toContain("rr")
  expect(s[0].why).toBe("Pull · Lats · Biceps")
})

test("with no pattern known, the name supplies one", () => {
  expect(patternsFromName("Broad Jump")).toEqual(["Plyometric"])
  expect(patternsFromName("Bulgarian Split Squat")).toEqual(["Lunge"])
  expect(patternsFromName("Seated Cable Row")).toEqual(["Pull"])
  expect(patternsFromName("Mystery Move")).toEqual([])
})

// ---------- in the session ----------

const NAME = "Swap Session"
let clientId = ""
let workoutId = ""
let rowId = ""

test.beforeAll(async () => {
  clientId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })).id
  await prisma.workout.deleteMany({ where: { clientId, name: NAME } })
  // Tomorrow, so coach-train's "Train today" never lands on this session.
  const d = new Date(Date.now() + 86_400_000)
  const today = fromDayKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`)
  const back = await prisma.exerciseLibrary.findFirst({ where: { name: "Back Squat", videoUrl: { not: null }, muscleGroups: { isEmpty: false } } })
  const w = await prisma.workout.create({
    data: {
      clientId, name: NAME, scheduledDate: today, dayOfWeek: today.getUTCDay(), order: 1,
      exercises: { create: [{ name: "Back Squat", exerciseId: back?.id ?? null, prescription: "3 x 5, rest 2 min", sets: 3, notes: "Brace hard", order: 1 }] },
    },
    include: { exercises: true },
  })
  workoutId = w.id
  rowId = w.exercises[0].id
})
test.afterAll(async () => {
  await prisma.workout.deleteMany({ where: { clientId, name: NAME } })
  await prisma.$disconnect()
})

test("the coach swaps an exercise mid-session from suggestions: same prescription, new movement, logged sets cleared", async ({ page }) => {
  await page.goto(`/coach/clients/${clientId}/workouts/${workoutId}/train`)
  // Log a set on the squat first, so the warning and the clearing are real.
  await page.getByRole("button", { name: "Set 1 done" }).click()
  await page.getByRole("button", { name: "⇄ Swap" }).click()

  const sheet = page.getByRole("dialog", { name: "Swap Back Squat" })
  await expect(sheet.getByText("1 set is logged on Back Squat")).toBeVisible()
  const suggestions = sheet.getByTestId("swap-suggestions")
  const first = suggestions.getByRole("button").first()
  await expect(first).toContainText("Squat · Glutes · Quads", { timeout: 15_000 })
  // Every suggestion is a squat-pattern exercise for the same muscles.
  for (const b of await suggestions.getByRole("button").all()) await expect(b).toContainText(/Glutes|Quads/)
  const picked = (await first.locator("span.font-semibold").textContent())!.trim()
  await first.click()

  // Still in the session, on the new movement, with fresh rows.
  await expect(sheet).toBeHidden()
  await expect(page).toHaveURL(/\/train$/)
  await expect(page.getByText(picked, { exact: true }).first()).toBeVisible()
  await expect(page.getByRole("button", { name: "Set 1 done" })).toHaveAttribute("aria-pressed", "false")

  const after = await prisma.workoutExercise.findUniqueOrThrow({ where: { id: rowId } })
  expect(after.name).toBe(picked)
  expect(after.prescription).toBe("3 x 5, rest 2 min")
  expect(after.sets).toBe(3)
  expect(after.notes).toBeNull()
  expect(await prisma.exerciseLog.count({ where: { workoutExerciseId: rowId } })).toBe(0)
})

test("searching works too for the coach, including a text-only exercise", async ({ page }) => {
  await page.goto(`/coach/clients/${clientId}/workouts/${workoutId}/train`)
  await page.getByRole("button", { name: "⇄ Swap" }).click()
  const sheet = page.getByRole("dialog")
  // Suggestions first, as the coach sees them, then a search for something else.
  await expect(sheet.getByTestId("swap-suggestions")).toBeVisible({ timeout: 15_000 })
  await sheet.getByRole("textbox", { name: "Search the library" }).fill("front squat")
  await expect(sheet.getByRole("button", { name: /As text only/ })).toBeVisible()
  await sheet.getByRole("button", { name: /^Front Squat/ }).first().click()
  await expect(sheet).toBeHidden()
  expect((await prisma.workoutExercise.findUniqueOrThrow({ where: { id: rowId } })).name).toBe("Front Squat")
})

test("a client swaps in their own workout: library picks only, a note for the coach, never in a finished session", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const cp = await ctx.newPage()
  await cp.goto("/auth/signin")
  await cp.locator('input[name="email"]').fill("playwright-client@dev.local")
  await cp.locator('input[name="password"]').fill("playwright-test-PW-1")
  await cp.locator('button[type="submit"]').click()
  await cp.waitForURL(/\/client$/, { timeout: 15_000 })
  await prisma.workoutComment.deleteMany({ where: { workoutId } })
  const before = (await prisma.workoutExercise.findUniqueOrThrow({ where: { id: rowId } })).name

  await cp.goto(`/client/workouts/${workoutId}`)
  await cp.getByRole("button", { name: "⇄ Swap" }).click()
  const sheet = cp.getByRole("dialog")
  await expect(sheet.getByText("Your coach gets a note")).toBeVisible()
  await expect(sheet.getByTestId("swap-suggestions")).toBeVisible({ timeout: 15_000 })
  await sheet.getByRole("textbox", { name: "Search the library" }).fill("goblet squat")
  await expect(sheet.getByRole("button", { name: /^Goblet Squat/ }).first()).toBeVisible()
  await expect(sheet.getByRole("button", { name: /As text only/ })).toHaveCount(0)
  await sheet.getByRole("button", { name: /^Goblet Squat/ }).first().click()
  await expect(sheet).toBeHidden()

  expect((await prisma.workoutExercise.findUniqueOrThrow({ where: { id: rowId } })).name).toBe("Goblet Squat")
  const notes = await prisma.workoutComment.findMany({ where: { workoutId } })
  expect(notes.map((n) => n.body)).toEqual([`Swapped ${before} for Goblet Squat.`])

  // A made-up name is refused for a client, and a finished session is off limits.
  expect((await cp.request.patch(`/api/workouts/${workoutId}/exercises/${rowId}`, { data: { name: "Air Squat" } })).status()).toBe(400)
  await prisma.workout.update({ where: { id: workoutId }, data: { isCompleted: true } })
  expect((await cp.request.get(`/api/workouts/${workoutId}/exercises/${rowId}`)).status()).toBe(404)
  await prisma.workout.update({ where: { id: workoutId }, data: { isCompleted: false } })
  await ctx.close()
})
