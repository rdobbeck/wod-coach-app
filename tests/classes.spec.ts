import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import http from "http"
import { dbUrl } from "../lib/db-url"
import { classFeedUrlOk, todayIn, upcomingClasses } from "../lib/classes"

/**
 * Group classes the coach teaches, from a feed they point the app at, listed
 * on the client's Book a session page with a booking link per class.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })
let coachId = ""

// A tiny feed server standing in for raw.githubusercontent.com. Each test uses
// its own path so Next's fetch cache can't hand one test another's feed.
let server: http.Server
let base = ""
const feeds = new Map<string, unknown>()

const plus = (days: number) => {
  const d = new Date(Date.now() + days * 86_400_000)
  return todayIn("America/Chicago", d)
}
const ryanFeed = () => ({
  generatedAt: new Date().toISOString(),
  coach: "Ryan Dobbeck",
  gym: { name: "MagMile CrossFit", scheduleUrl: "https://magmilecrossfit.wodify.com/OnlineSalesPortal/ViewSchedule.aspx?LocationId=11492" },
  weeks: [
    {
      weekOf: plus(-3),
      classes: [
        { date: plus(-1), day: "Tue", start: "4:30 PM", end: "5:30 PM", title: "CrossFit", bookUrl: "https://magmilecrossfit.wodify.com/x?ClassId=1" },
        { date: plus(2), day: "Fri", start: "6:30 PM", end: "7:30 PM", title: "CrossFit", bookUrl: "https://magmilecrossfit.wodify.com/x?ClassId=3" },
        { date: plus(2), day: "Fri", start: "5:30 PM", end: "6:30 PM", title: "CrossFit", bookUrl: "https://magmilecrossfit.wodify.com/x?ClassId=2" },
      ],
    },
    { weekOf: plus(4), classes: [{ date: plus(8), day: "Thu", start: "6:00 AM", end: "7:00 AM", title: "Olympic Lifting" }] },
  ],
})

test.beforeAll(async () => {
  const coach = await prisma.user.findUniqueOrThrow({ where: { email: "playwright-coach@dev.local" } })
  coachId = coach.id
  await prisma.sessionLocation.deleteMany({ where: { coachId } })
  await prisma.coachProfile.upsert({
    where: { userId: coachId },
    update: { textNumber: null, classFeedUrl: null },
    create: { userId: coachId, textNumber: null, classFeedUrl: null },
  })
  server = http.createServer((req, res) => {
    const body = feeds.get(req.url ?? "")
    if (body === undefined) return void res.writeHead(404).end("nope")
    if (body === "broken") return void res.writeHead(200, { "content-type": "application/json" }).end("{not json")
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body))
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})

test.afterAll(async () => {
  await prisma.coachProfile.update({ where: { userId: coachId }, data: { classFeedUrl: null, textNumber: null } })
  await prisma.$disconnect()
  server.close()
})

async function signInAsClient(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

test("helpers: feed address rules and upcoming-class filtering", () => {
  expect(classFeedUrlOk("https://raw.githubusercontent.com/rdobbeck/ryan-classes/main/docs/classes.json")).toContain("ryan-classes")
  expect(classFeedUrlOk("http://example.com/feed.json")).toBeNull()
  expect(classFeedUrlOk("http://localhost:3999/feed.json")).toBe("http://localhost:3999/feed.json")
  expect(classFeedUrlOk("nope")).toBeNull()

  const f = upcomingClasses(ryanFeed(), plus(0))
  expect(f.gym.name).toBe("MagMile CrossFit")
  // Yesterday is gone; the two Fridays come out in time order; next week's class is last.
  expect(f.classes.map((c) => [c.date, c.start])).toEqual([
    [plus(2), "5:30 PM"],
    [plus(2), "6:30 PM"],
    [plus(8), "6:00 AM"],
  ])
  expect(f.classes[2].bookUrl).toBeNull()

  // Garbage in, empty list out.
  expect(upcomingClasses(null, plus(0)).classes).toEqual([])
  expect(upcomingClasses({ weeks: [{ classes: [{ date: "soon", start: "9" }] }] }, plus(0)).classes).toEqual([])
})

test("no feed means no class card and the class page sends them back", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signInAsClient(page)
  await expect(page.getByRole("link", { name: /Book a class/ })).toBeHidden()
  await page.goto("/client/book/class")
  await page.waitForURL(/\/client$/)
  await ctx.close()
})

test("coach sets the feed; the client sees upcoming classes with booking links", async ({ page, browser }) => {
  const path = `/ryan-${Date.now()}.json`
  feeds.set(path, ryanFeed())

  await page.goto("/coach/settings")
  const section = page.getByTestId("session-locations")
  await section.getByPlaceholder("(773) 491-7926").fill("(773) 491-7926")
  await section.getByPlaceholder(/classes\.json/).fill(`${base}${path}`)
  await section.getByRole("button", { name: "Save places" }).click()
  await expect(page.getByText("Clients can book a session")).toBeVisible()
  expect((await prisma.coachProfile.findUniqueOrThrow({ where: { userId: coachId } })).classFeedUrl).toBe(`${base}${path}`)

  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const clientPage = await ctx.newPage()
  await signInAsClient(clientPage)
  await clientPage.getByRole("link", { name: /Book a class/ }).click()
  await clientPage.waitForURL(/\/client\/book\/class$/)

  const classes = clientPage.getByTestId("classes")
  await expect(classes).toContainText("at MagMile CrossFit")
  const rows = classes.getByTestId("class")
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText("5:30 PM to 6:30 PM")
  await expect(rows.nth(0).getByRole("link", { name: "Book" })).toHaveAttribute("href", /ClassId=2$/)
  await expect(rows.nth(1).getByRole("link", { name: "Book" })).toHaveAttribute("href", /ClassId=3$/)
  // No per-class link falls back to the gym's schedule.
  await expect(rows.nth(2)).toContainText("Olympic Lifting")
  await expect(rows.nth(2).getByRole("link", { name: "Schedule" })).toHaveAttribute("href", /ViewSchedule/)
  await expect(classes.getByRole("link", { name: /Text Playwright/ })).toHaveAttribute("href", /^sms:/)
  await ctx.close()
})

test("a feed that is down or broken shows the empty state and nothing else breaks", async ({ browser }) => {
  const path = `/broken-${Date.now()}.json`
  feeds.set(path, "broken")
  await prisma.coachProfile.update({ where: { userId: coachId }, data: { classFeedUrl: `${base}${path}`, textNumber: null } })

  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signInAsClient(page)
  await page.getByRole("link", { name: /Book a class/ }).click()
  await page.waitForURL(/\/client\/book\/class$/)
  await expect(page.getByTestId("classes")).toContainText("No classes on the schedule yet")
  await expect(page.getByTestId("class")).toHaveCount(0)

  // A 404 is the same story.
  await prisma.coachProfile.update({ where: { userId: coachId }, data: { classFeedUrl: `${base}/missing-${Date.now()}.json` } })
  await page.reload()
  await expect(page.getByTestId("classes")).toContainText("No classes on the schedule yet")
  await ctx.close()
})
