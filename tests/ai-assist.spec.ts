import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { dbUrl } from "../lib/db-url"
import { dayKey } from "../lib/training-format"
import { assertUnderCap, spendMeter, AiCapError, monthStart } from "../lib/ai/spend"
import { parseProposal, type Context } from "../lib/ai/assist"

/**
 * The AI box: the monthly spend cap, what the assistant is allowed to touch,
 * and applying and undoing its edits. No test calls the real model; the
 * browser test mocks the model's reply and everything after it is real.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })

let coachId = ""
let clientId = ""
let otherId = ""
const PREFIX = "AI "
const tomorrow = () => {
  const d = new Date(`${dayKey(new Date())}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d
}

async function seedSession(name: string, opts: { owner?: string; done?: boolean; when?: Date } = {}) {
  const d = opts.when ?? tomorrow()
  return prisma.workout.create({
    data: {
      clientId: opts.owner ?? clientId,
      name,
      scheduledDate: d,
      dayOfWeek: d.getUTCDay(),
      order: 1,
      isCompleted: opts.done ?? false,
      exercises: {
        create: [
          { name: "Back Squat", prescription: "3x5 @ RPE 7, rest 2 min", order: 1, notes: "Brace hard", sets: 3, reps: "5" },
          { name: "Strict Press", prescription: "3x8 @ RPE 7, rest 2 min", order: 2 },
          { name: "Inverted row", prescription: "3x10, rest 90 s", order: 3 },
        ],
      },
    },
    include: { exercises: { orderBy: { order: "asc" } } },
  })
}

async function cleanup() {
  await prisma.aiChangeSet.deleteMany({ where: { clientId } })
  await prisma.aiUsage.deleteMany({ where: { coachId } })
  await prisma.workout.deleteMany({ where: { clientId: { in: [clientId, otherId].filter(Boolean) }, name: { startsWith: PREFIX } } })
}

test.beforeAll(async () => {
  coachId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-coach@dev.local" } })).id
  clientId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })).id
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { tourSeenAt: new Date() } })
  const other = await prisma.user.upsert({
    where: { email: "playwright-other@dev.local" },
    update: {},
    create: { email: "playwright-other@dev.local", name: "Other Client", role: "CLIENT", hashedPassword: await bcrypt.hash("x-not-used-1", 10), clientProfile: { create: {} } },
  })
  otherId = other.id
  await cleanup()
})
test.afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})
test.beforeEach(async () => {
  await prisma.aiChangeSet.deleteMany({ where: { clientId } })
  await prisma.aiUsage.deleteMany({ where: { coachId } })
})

// ---------- the cap ----------

test("spend meter warns at 60% and stops at the cap, and resets each month", async () => {
  const add = (usd: number, at = new Date()) =>
    prisma.aiUsage.create({ data: { coachId, kind: "assist", model: "test", costUsd: usd, createdAt: at } })

  expect((await spendMeter(coachId)).level).toBe("ok")
  await add(14)
  expect((await spendMeter(coachId)).level).toBe("ok")
  await add(1.5) // 15.50 of 25 is past 60%
  expect((await spendMeter(coachId)).level).toBe("warn")
  await add(9.5) // exactly 25
  const m = await spendMeter(coachId)
  expect(m.level).toBe("capped")
  await expect(assertUnderCap(coachId)).rejects.toBeInstanceOf(AiCapError)

  // Last month's spending does not count against this month.
  await prisma.aiUsage.deleteMany({ where: { coachId } })
  const lastMonth = new Date(monthStart().getTime() - 86_400_000)
  await add(40, lastMonth)
  expect((await spendMeter(coachId)).spent).toBe(0)
  await expect(assertUnderCap(coachId)).resolves.toBeTruthy()
})

test("once the cap is reached the endpoint refuses before calling any model", async ({ page }) => {
  await prisma.aiUsage.create({ data: { coachId, kind: "assist", model: "test", costUsd: 26 } })
  const res = await page.request.post("/api/ai/assist", { data: { clientId, message: "Rebuild next week" } })
  expect(res.status()).toBe(402)
  const body = await res.json()
  expect(body.code).toBe("AI_CAP")
  expect(body.error).toMatch(/monthly AI limit/i)
  // Nothing was recorded, so nothing was spent on a model call.
  expect(await prisma.aiUsage.count({ where: { coachId } })).toBe(1)
})

test("only a coach of that client can use the assistant", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  const anon = await page.request.post("/api/ai/assist", { data: { clientId, message: "hi" } })
  expect(anon.status()).toBe(401)
  const anonApply = await page.request.post("/api/ai/assist/apply", { data: { clientId, changes: [{ action: "remove", workoutId: "x" }] } })
  expect(anonApply.status()).toBe(401)
  await ctx.close()
})

// ---------- reading the model's answer ----------

const ctx: Context = {
  profile: "Units: lb",
  recent: "",
  sessions: [
    {
      ref: "s1", id: "w1", date: "2026-10-01", name: "Day A",
      exercises: [
        { ref: "s1e1", id: "e1", name: "Back Squat", rx: "3x5", locked: false },
        { ref: "s1e2", id: "e2", name: "Strict Press", rx: "3x8", locked: true },
        { ref: "s1e3", id: "e3", name: "Inverted row", rx: "3x10", locked: false },
      ],
    },
  ],
}
const match = (n: string) => (n === "Goblet Squat" ? "lib1" : null)
const libName = (id: string) => (id === "lib1" ? "Goblet Squat" : null)

test("the model's answer is checked before anyone sees it", () => {
  const answer = JSON.stringify({
    reply: "Swapped the squat and trimmed the rest.",
    changes: [
      { action: "replace", ref: "s1e1", newExercise: "Goblet Squat", newPrescription: "3x8 — light", reason: "Knee friendly" },
      { action: "replace", ref: "s9e1", newExercise: "Goblet Squat", newPrescription: "3x8", reason: "no such session" },
      { action: "remove", ref: "s1e2", reason: "locked, has logged sets" },
      { action: "modify", ref: "s1e1", newPrescription: "2x8", reason: "second change to the same row" },
      { action: "add", ref: "s1", newExercise: "Plank", reason: "no prescription given" },
      { action: "add", ref: "s1", newExercise: "Made Up Movement", newPrescription: "3x30 s", reason: "not in the library" },
      { action: "explode", ref: "s1e3" },
    ],
    warnings: ["Check the landmine attachment exists"],
  })
  const p = parseProposal(answer, ctx, match, libName)

  expect(p.changes.map((c) => `${c.action}:${c.exerciseId ?? c.workoutId}`)).toEqual(["replace:e1", "add:w1"])
  const replace = p.changes[0]
  expect(replace.newExercise).toBe("Goblet Squat")
  expect(replace.libraryId).toBe("lib1")
  expect(replace.inLibrary).toBe(true)
  // No em or en dashes ever reach the calendar.
  expect(replace.newPrescription).toBe("3x8, light")
  // An exercise that is not in the library is kept, but flagged as having no video.
  expect(p.changes[1].inLibrary).toBe(false)

  expect(p.dropped.join(" ")).toContain("s9e1")
  expect(p.dropped.join(" ")).toContain("already has logged sets")
  expect(p.dropped.join(" ")).toContain("changed twice")
  expect(p.dropped.length).toBe(5)
  expect(p.warnings).toEqual(["Check the landmine attachment exists"])
})

test("answers that are not clean JSON still come through", () => {
  const fenced = parseProposal('```json\n{"reply":"Nothing to change.","changes":[]}\n```', ctx, match, libName)
  expect(fenced.reply).toBe("Nothing to change.")
  const prose = parseProposal("Sure. Which weeks do you mean?", ctx, match, libName)
  expect(prose.reply).toBe("Sure. Which weeks do you mean?")
  expect(prose.changes).toEqual([])
})

// ---------- applying and undoing ----------

test("applying edits respects locked, done and other clients' sessions, and undo restores everything", async ({ page, browser }) => {
  const w = await seedSession(`${PREFIX}Apply Me`)
  const done = await seedSession(`${PREFIX}Already Done`, { done: true })
  const theirs = await seedSession(`${PREFIX}Not Theirs`, { owner: otherId })
  const [squat, press, row] = w.exercises

  // The client logs a set on the press, which locks it from AI edits.
  const cctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const cp = await cctx.newPage()
  await cp.goto("/auth/signin")
  await cp.locator('input[name="email"]').fill("playwright-client@dev.local")
  await cp.locator('input[name="password"]').fill("playwright-test-PW-1")
  await cp.locator('button[type="submit"]').click()
  await cp.waitForURL(/\/client$/, { timeout: 15_000 })
  const logged = await cp.request.put(`/api/workouts/${w.id}/log`, {
    data: { exercises: [{ workoutExerciseId: press.id, resultText: "", rpe: null, sets: [{ weight: 95, reps: 8, rpe: null, done: true }] }], complete: false },
  })
  expect(logged.ok()).toBe(true)
  await cctx.close()

  const res = await page.request.post("/api/ai/assist/apply", {
    data: {
      clientId,
      request: "test request",
      changes: [
        { action: "replace", workoutId: w.id, exerciseId: squat.id, newExercise: "Goblet Squat", newPrescription: "3x10, rest 90 s" },
        { action: "replace", workoutId: w.id, exerciseId: press.id, newExercise: "Push-Up", newPrescription: "3x10" }, // logged: refused
        { action: "remove", workoutId: w.id, exerciseId: row.id },
        { action: "add", workoutId: w.id, newExercise: "Face Pull", newPrescription: "3x15" },
        { action: "modify", workoutId: done.id, exerciseId: done.exercises[0].id, newPrescription: "1x1" }, // done: refused
        { action: "remove", workoutId: theirs.id, exerciseId: theirs.exercises[0].id }, // someone else's: refused
      ],
    },
  })
  expect(res.ok()).toBe(true)
  const out = await res.json()
  expect(out.applied).toBe(3)
  expect(out.skipped).toHaveLength(3)

  const after = await prisma.workoutExercise.findMany({ where: { workoutId: w.id }, orderBy: { order: "asc" } })
  expect(after.map((e) => e.name)).toEqual(["Goblet Squat", "Strict Press", "Face Pull"])
  expect(after[0].prescription).toBe("3x10, rest 90 s")
  // The old movement's cue and numbers went with it.
  expect(after[0].notes).toBeNull()
  expect(after[0].sets).toBeNull()
  // Untouched: the logged exercise, the done session, the other client's session.
  expect(after[1].prescription).toBe("3x8 @ RPE 7, rest 2 min")
  expect((await prisma.workoutExercise.findUniqueOrThrow({ where: { id: done.exercises[0].id } })).prescription).toBe("3x5 @ RPE 7, rest 2 min")
  expect(await prisma.workoutExercise.count({ where: { workoutId: theirs.id } })).toBe(3)

  // Undo puts the batch back exactly as it was.
  const undo = await page.request.post("/api/ai/assist/undo", { data: { changeSetId: out.changeSetId } })
  expect(undo.ok()).toBe(true)
  const back = await prisma.workoutExercise.findMany({ where: { workoutId: w.id }, orderBy: { order: "asc" } })
  expect(back.map((e) => e.name)).toEqual(["Back Squat", "Strict Press", "Inverted row"])
  expect(back[0].prescription).toBe("3x5 @ RPE 7, rest 2 min")
  expect(back[0].notes).toBe("Brace hard")
  expect(back[0].sets).toBe(3)
  expect(back[2].id).toBe(row.id) // the removed row is the same row again

  // And it cannot be undone twice.
  const again = await page.request.post("/api/ai/assist/undo", { data: { changeSetId: out.changeSetId } })
  expect(again.status()).toBe(404)
})

// ---------- the panel ----------

async function openPanel(page: Page) {
  await page.goto(`/coach/clients/${clientId}`)
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: /Ask AI about/ }).click()
  await expect(page.getByRole("dialog", { name: "AI assistant" })).toBeVisible()
}

test("in the panel: review a proposal, untick a change, apply, undo", async ({ page }) => {
  const w = await seedSession(`${PREFIX}Panel Session`)
  const [squat, , row] = w.exercises
  await prisma.aiUsage.create({ data: { coachId, kind: "assist", model: "test", costUsd: 3.2 } })

  // Only the model's reply is faked. Applying and undoing are real.
  await page.route("**/api/ai/assist", async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    await route.fulfill({
      json: {
        reply: "Swapped the squat and dropped the row.",
        changes: [
          { action: "replace", workoutId: w.id, workoutName: w.name, date: dayKey(w.scheduledDate), exerciseId: squat.id, exercise: "Back Squat", newExercise: "Goblet Squat", newPrescription: "3x10", libraryId: null, inLibrary: false, reason: "Easier on the knee" },
          { action: "remove", workoutId: w.id, workoutName: w.name, date: dayKey(w.scheduledDate), exerciseId: row.id, exercise: "Inverted row", reason: "Cut for time" },
        ],
        warnings: ["Check the knee feels okay"],
        dropped: [],
        meter: { spent: 3.26, cap: 25, level: "ok" },
      },
    })
  })

  await openPanel(page)
  await expect(page.getByText("$3.20 of $25")).toBeVisible()
  await page.getByPlaceholder("Ask a question or describe a change").fill("His knee hurts, ease the squat")
  await page.getByRole("button", { name: "Send" }).click()

  await expect(page.getByText("Swapped the squat and dropped the row.")).toBeVisible()
  await expect(page.getByText("no demo video")).toBeVisible() // Goblet Squat is not in the test library
  await expect(page.getByText("Check the knee feels okay")).toBeVisible()
  await expect(page.getByText("$3.26 of $25")).toBeVisible()

  // Untick the removal, so only the swap goes through.
  await page.getByRole("dialog", { name: "AI assistant" }).getByRole("checkbox").nth(1).uncheck()
  await page.getByRole("button", { name: "Apply 1 change" }).click()
  await expect(page.getByText(/Applied 1 change to/)).toBeVisible()
  await expect.poll(async () => (await prisma.workoutExercise.findUniqueOrThrow({ where: { id: squat.id } })).name).toBe("Goblet Squat")
  expect(await prisma.workoutExercise.count({ where: { id: row.id } })).toBe(1) // the unticked one stayed

  const undone = page.waitForResponse((r) => r.url().includes("/api/ai/assist/undo"))
  await page.getByRole("button", { name: "Undo" }).click()
  const ur = await undone
  expect(ur.status(), await ur.text()).toBe(200)
  await expect(page.getByText(/Undone/)).toBeVisible()
  await expect.poll(async () => (await prisma.workoutExercise.findUniqueOrThrow({ where: { id: squat.id } })).name).toBe("Back Squat")
})

test("in the panel: at the cap the box is switched off", async ({ page }) => {
  await prisma.aiUsage.create({ data: { coachId, kind: "assist", model: "test", costUsd: 25.5 } })
  await openPanel(page)
  await expect(page.getByPlaceholder("Monthly AI limit reached")).toBeDisabled()
  await expect(page.getByText("$25.50 of $25")).toBeVisible()
})
