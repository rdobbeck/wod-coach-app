import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"
import { dayKey, fromDayKey } from "../lib/training"
import { zonedToUtc } from "../lib/calendar-invite"

/**
 * Schedule my session / Schedule my week: the client picks when they'll train,
 * the app remembers it, and hands them a calendar invite.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })
const TZ = "America/Chicago"
test.use({ timezoneId: TZ })

let clientId = ""
const DAY = 86_400_000
// Two and three days out: always in the future, whatever the hour.
const dayA = dayKey(new Date(Date.now() + 2 * DAY))
const dayB = dayKey(new Date(Date.now() + 3 * DAY))
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")

test.beforeAll(async () => {
  const client = await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })
  clientId = client.id
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { canMoveWorkouts: true, tourSeenAt: new Date() } })
  // Other specs seed workouts for this client; Schedule my week sees all of them, so start empty.
  await prisma.workout.deleteMany({ where: { clientId } })
})

test.afterAll(async () => {
  await prisma.workout.deleteMany({ where: { clientId, name: { startsWith: "Sched " } } })
  await prisma.$disconnect()
})

async function seed() {
  await prisma.workout.deleteMany({ where: { clientId, name: { startsWith: "Sched " } } })
  const make = (name: string, day: string) => {
    const d = fromDayKey(day)
    return prisma.workout.create({
      data: {
        clientId,
        name,
        scheduledDate: d,
        dayOfWeek: d.getUTCDay(),
        order: 1,
        exercises: { create: [{ name: "Back Squat", prescription: "3 x 5", order: 1 }, { name: "Pull-up", prescription: "3 x 8", order: 2 }] },
      },
    })
  }
  return { a: await make("Sched Lower", dayA), b: await make("Sched Upper", dayB) }
}

async function signInAsClient(page: Page) {
  await page.context().clearCookies()
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

test("schedule one session: saved, and the invite has the right time", async ({ page }) => {
  const { a } = await seed()
  await signInAsClient(page)
  await page.goto(`/client/workouts/${a.id}`)

  await page.getByRole("button", { name: "Schedule my session" }).click()
  const sheet = page.getByRole("dialog", { name: "Schedule my session" })
  await sheet.getByLabel("Time", { exact: true }).fill("06:15")
  await sheet.getByRole("button", { name: "45", exact: true }).click()
  await sheet.getByRole("button", { name: "Save time" }).click()
  await expect(sheet.getByRole("heading", { name: "Add it to your calendar" })).toBeVisible()

  const row = await prisma.workout.findUniqueOrThrow({ where: { id: a.id } })
  expect(row).toMatchObject({ plannedTime: "06:15", plannedMinutes: 45, plannedTz: TZ })
  expect(row.plannedAt).not.toBeNull()

  const start = zonedToUtc(dayA, "06:15", TZ)
  const end = new Date(start.getTime() + 45 * 60_000)

  // Apple / Outlook: the .ics the button points at.
  const href = await sheet.getByRole("link", { name: "Apple / Outlook calendar" }).getAttribute("href")
  const res = await page.request.get(href!)
  expect(res.status()).toBe(200)
  expect(res.headers()["content-type"]).toContain("text/calendar")
  const ics = await res.text()
  expect(ics).toContain(`DTSTART:${stamp(start)}`)
  expect(ics).toContain(`DTEND:${stamp(end)}`)
  expect(ics).toContain("SUMMARY:Train: Sched Lower")
  expect(ics).toContain("TRIGGER:-PT30M")

  // Google: a prefilled event page with the same times.
  const g = new URL((await sheet.getByRole("link", { name: "Google Calendar" }).getAttribute("href"))!)
  expect(g.hostname).toBe("calendar.google.com")
  expect(g.searchParams.get("dates")).toBe(`${stamp(start)}/${stamp(end)}`)

  await sheet.getByRole("button", { name: "Done" }).click()
  await expect(page.getByText("Training at 6:15 AM")).toBeVisible()

  // The next session's sheet starts at the time they picked last.
  const b = await prisma.workout.findFirstOrThrow({ where: { clientId, name: "Sched Upper" } })
  await page.goto(`/client/workouts/${b.id}`)
  await page.getByRole("button", { name: "Schedule my session" }).click()
  await expect(page.getByRole("dialog").getByLabel("Time", { exact: true })).toHaveValue("06:15")
})

test("schedule my week: one time for every session, one file with all of them", async ({ page }) => {
  const { a, b } = await seed()
  // Sessions in the week on screen (Monday to Sunday, Chicago); B may fall in next week.
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }))
  const sunday = new Date(now)
  sunday.setDate(now.getDate() + ((7 - now.getDay()) % 7))
  const weekEnd = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, "0")}-${String(sunday.getDate()).padStart(2, "0")}`
  const expected = [a, b].filter((w) => dayKey(w.scheduledDate) <= weekEnd)
  test.skip(expected.length === 0, "both seeded days fall in next week")

  await signInAsClient(page)
  await page.goto("/client")
  await page.getByRole("button", { name: "Schedule my week" }).click()
  let sheet = page.getByRole("dialog", { name: "Schedule my week" })
  await sheet.getByLabel("Time", { exact: true }).fill("18:00")
  await sheet.getByRole("button", { name: "Save time" }).click()
  await expect(sheet.getByRole("heading", { name: "Add it to your calendar" })).toBeVisible()

  const rows = await prisma.workout.findMany({ where: { id: { in: [a.id, b.id] }, plannedTime: "18:00" } })
  expect(rows.map((r) => r.id).sort()).toEqual(expected.map((w) => w.id).sort())

  const href = await sheet.getByRole("link", { name: /Add all to Apple|Apple \/ Outlook calendar/ }).getAttribute("href")
  const ics = await (await page.request.get(href!)).text()
  expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(expected.length)
  for (const w of expected) expect(ics).toContain(`DTSTART:${stamp(zonedToUtc(dayKey(w.scheduledDate), "18:00", TZ))}`)
  await sheet.getByRole("button", { name: "Done" }).click()

  await page.getByRole("button", { name: "Schedule my week" }).click()
  sheet = page.getByRole("dialog", { name: "Schedule my week" })
  await expect(sheet.getByLabel("Time", { exact: true })).toHaveValue("18:00")
})

test("moving a scheduled session keeps its time and asks to update the calendar", async ({ page }) => {
  const { a } = await seed()
  await prisma.workout.update({ where: { id: a.id }, data: { plannedTime: "07:00", plannedMinutes: 60, plannedTz: TZ, plannedAt: new Date() } })
  await signInAsClient(page)

  const moved = await page.request.post(`/api/workouts/${a.id}/move`, { data: { date: dayB } })
  expect(moved.ok()).toBe(true)

  await page.goto(`/client/workouts/${a.id}`)
  await expect(page.getByText("Moved since you added it to your calendar")).toBeVisible()
  await page.getByRole("button", { name: "Update calendar" }).click()
  const sheet = page.getByRole("dialog", { name: "Schedule my session" })
  await expect(sheet.getByText("This session moved since you added it")).toBeVisible()
  // The invite is for the new day, same time.
  const ics = await (await page.request.get((await sheet.getByRole("link", { name: "Apple / Outlook calendar" }).getAttribute("href"))!)).text()
  expect(ics).toContain(`DTSTART:${stamp(zonedToUtc(dayB, "07:00", TZ))}`)
})

test("clear my time", async ({ page }) => {
  const { a } = await seed()
  await prisma.workout.update({ where: { id: a.id }, data: { plannedTime: "07:00", plannedMinutes: 60, plannedTz: TZ, plannedAt: new Date() } })
  await signInAsClient(page)
  await page.goto(`/client/workouts/${a.id}`)
  await page.getByRole("button", { name: "Change time" }).click()
  await page.getByRole("button", { name: "Clear my time" }).click()
  await expect(page.getByRole("button", { name: "Schedule my session" })).toBeVisible()
  expect((await prisma.workout.findUniqueOrThrow({ where: { id: a.id } })).plannedTime).toBeNull()
})

test("guards: only the client's own sessions, valid times", async ({ page, request }) => {
  const { a } = await seed()
  // The coach (default storage state) can't set a client's time.
  expect((await request.post("/api/plan", { data: { tz: TZ, items: [{ id: a.id, time: "07:00" }] } })).status()).toBe(404)
  expect((await request.get(`/api/plan/ics?ids=${a.id}`)).status()).toBe(400)

  await signInAsClient(page)
  const post = (data: unknown) => page.request.post("/api/plan", { data })
  expect((await post({ tz: TZ, items: [{ id: a.id, time: "7:00" }] })).status()).toBe(400)
  expect((await post({ tz: "Mars/Base", items: [{ id: a.id, time: "07:00" }] })).status()).toBe(400)
  expect((await post({ tz: TZ, items: [{ id: a.id, time: "07:00", minutes: 1000 }] })).status()).toBe(400)
  expect((await post({ tz: TZ, items: [{ id: "nope", time: "07:00" }] })).status()).toBe(404)
  await prisma.workout.update({ where: { id: a.id }, data: { isCompleted: true } })
  expect((await post({ tz: TZ, items: [{ id: a.id, time: "07:00" }] })).status()).toBe(404)
})

test("the coach sees the client's planned time on their calendar", async ({ page }) => {
  const { a } = await seed()
  await prisma.workout.update({ where: { id: a.id }, data: { plannedTime: "17:30", plannedMinutes: 60, plannedTz: TZ, plannedAt: new Date() } })
  await page.goto(`/coach/clients/${clientId}?m=${dayA.slice(0, 7)}`)
  await expect(page.getByRole("link", { name: /5:30pm\s*Sched Lower/ })).toBeVisible()
})
