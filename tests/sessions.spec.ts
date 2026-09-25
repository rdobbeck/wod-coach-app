import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"
import { parseIcs, parseWhen } from "../lib/sessions/ics"
import { parseTitle } from "../lib/sessions/title"
import { matchEvent, type ClientRef } from "../lib/sessions/match"
import { computeCounter, numberEvents, type CounterEvent } from "../lib/sessions/counter"
import { syncCalendar } from "../lib/sessions/sync"

/**
 * The session counter: reading the coach's calendar, matching sessions to
 * clients, counting them, and showing the result to both sides. Titles below
 * follow the shapes on the real calendar, with the names changed.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })
let coachId = ""
let clientId = ""

// ---------- reading the calendar ----------

test("the calendar feed is read: folded lines, time zones, guests, cancelled and all-day events", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:aaa@google.com",
    "DTSTART:20260929T230000Z",
    "DTEND:20260930T000000Z",
    "SUMMARY:Personal Training 1HR Geetika 5/10",
    "ATTENDEE;CN=Geetika;PARTSTAT=ACCEPTED:mailto:Geetika@Example.com",
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:bbb@google.com",
    "DTSTART;TZID=America/Chicago:20261012T180000",
    "DTEND;TZID=America/Chicago:20261012T190000",
    "SUMMARY:Sasha Workout 60min _/10 _needspayment, folded ",
    " over two lines",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:ccc@google.com",
    "DTSTART;VALUE=DATE:20261013",
    "SUMMARY:All day thing",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:ddd@google.com",
    "DTSTART:20261014T150000Z",
    "SUMMARY:Cancelled one",
    "STATUS:CANCELLED",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:eee@google.com",
    "DTSTART;TZID=America/Chicago:20261015T180000",
    "RRULE:FREQ=WEEKLY",
    "SUMMARY:CrossFit: 6:00 PM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n")
  const ev = parseIcs(ics)
  expect(ev.map((e) => e.uid)).toEqual(["aaa@google.com", "bbb@google.com", "ddd@google.com", "eee@google.com"]) // all-day skipped
  expect(ev[0].startsAt.toISOString()).toBe("2026-09-29T23:00:00.000Z")
  expect(ev[0].attendees).toEqual(["geetika@example.com"])
  // 6 PM in Chicago in October is 23:00 UTC (daylight time), and 6 PM in January is 00:00 UTC next day.
  expect(ev[1].startsAt.toISOString()).toBe("2026-10-12T23:00:00.000Z")
  expect(parseWhen("20270115T180000", { TZID: "America/Chicago" }, "UTC")!.toISOString()).toBe("2027-01-16T00:00:00.000Z")
  expect(ev[1].title).toBe("Sasha Workout 60min _/10 _needspayment, folded over two lines")
  expect(ev[2].cancelled).toBe(true)
  expect(ev[3].repeats).toBe(true)
})

// ---------- titles ----------

test("titles: the package count, the payment flag, and what looks like a session", () => {
  const t = (s: string) => parseTitle(s)
  expect(t("Personal Training 1HR Geetika 9/10")).toMatchObject({ index: 9, size: 10, needsPayment: false, looksLikeSession: true })
  expect(t("Elliott Fredland: 1 Hour Personal Training 5/10 lower body day")).toMatchObject({ index: 5, size: 10 })
  expect(t("Sasha Workout 60min _/10 _needspayment")).toMatchObject({ index: null, size: 10, needsPayment: true })
  expect(t("Personal Training 1HR Geetika 3/10 _ Needs payment").needsPayment).toBe(true)
  expect(t("1 Hour Personal Training (Off-Site) between Dobbeck Training Systems and Andrew Thresher 3/10")).toMatchObject({ index: 3, size: 10, looksLikeSession: true })
  // Not a count: a time, money, a session with no count, a class, an errand.
  expect(t("CrossFit: 6:00 PM")).toMatchObject({ index: null, size: null, looksLikeSession: false })
  expect(t("Bike - 8-10 deliveries - $150+").looksLikeSession).toBe(false)
  expect(t("Fitness Consultation between Dobbeck Training Systems and John Singletary").looksLikeSession).toBe(false)
  expect(t("Jered Carr: 1 Hour Personal Training")).toMatchObject({ index: null, size: null, looksLikeSession: true })
  // 12/10 can't be session 12 of 10.
  expect(t("Personal Training 12/10")).toMatchObject({ index: null, size: null })
})

// ---------- matching ----------

const people: ClientRef[] = [
  { id: "geetika", name: "Geetika Shah", email: "geetika@example.com" },
  { id: "sasha", name: "Sasha Letchinger", email: "sasha@example.com" },
  { id: "elliott", name: "Elliott Fredland", email: null },
  { id: "eric1", name: "Eric Winkfield", email: null },
  { id: "eric2", name: "Eric Boticki", email: null },
  { id: "jered", name: "Jered Carr", email: null },
]

test("matching: guest email first, then an alias, then a name, and never a guess between two Erics", () => {
  const m = (title: string, attendees: string[] = [], aliases: { clientId: string; alias: string }[] = []) => matchEvent({ title, attendees }, people, aliases)

  expect(m("Personal Training 1HR 5/10", ["GEETIKA@example.com"])).toEqual({ clientIds: ["geetika"], by: "email" })
  expect(m("Sasha Workout 60min 3/10")).toEqual({ clientIds: ["sasha"], by: "name" })
  expect(m("Elliott Fredland: 1 Hour Personal Training 5/10")).toEqual({ clientIds: ["elliott"], by: "name" })
  expect(m("Personal Training 1HR Geetika 9/10")).toEqual({ clientIds: ["geetika"], by: "name" })
  // A first name two clients share is not enough.
  expect(m("Eric 1 Hour Personal Training 2/10")).toEqual({ clientIds: [], by: null })
  expect(m("Eric Boticki 1 Hour Personal Training 2/10")).toEqual({ clientIds: ["eric2"], by: "name" })
  // "Murray" means nothing until the coach says who it is.
  expect(m("4 HR Personal Training - Murray 4/10").clientIds).toEqual([])
  expect(m("4 HR Personal Training - Murray 4/10", [], [{ clientId: "jered", alias: "murray" }])).toEqual({ clientIds: ["jered"], by: "alias" })
  // Two clients on one session is a tandem session.
  expect(m("Elliott and Jered: 1 Hour Personal Training 6/10").clientIds.sort()).toEqual(["elliott", "jered"])
  // The coach's own words are not a client.
  expect(m("Fitness Consultation between Dobbeck Training Systems and John").clientIds).toEqual([])
})

// ---------- counting ----------

const at = (iso: string) => new Date(iso)
const ev = (iso: string, index: number | null, size: number | null = 10, extra: Partial<CounterEvent> = {}): CounterEvent => ({
  startsAt: at(iso), endsAt: null, packageIndex: index, packageSize: size, needsPayment: false, ...extra,
})
const NOW = at("2026-09-24T12:00:00Z")

test("counter: used and left come from the numbers in the titles", () => {
  const c = computeCounter([ev("2026-09-10T20:00:00Z", 4), ev("2026-09-17T20:00:00Z", 5), ev("2026-10-01T20:00:00Z", 6)], NOW)
  expect(c).toMatchObject({ used: 5, size: 10, left: 5, packageDone: false, estimated: false })
  expect(c.next?.startsAt.toISOString()).toBe("2026-10-01T20:00:00.000Z")
})

test("counter: a session with no count is counted on, and a finished package starts a new one", () => {
  // Booked through the website, so no count in the title: 5/10 then an unnumbered one is 6.
  const counted = numberEvents([ev("2026-09-10T20:00:00Z", 5), ev("2026-09-17T20:00:00Z", null, null)])
  expect(counted.map((e) => [e.n, e.size, e.inferred])).toEqual([[5, 10, false], [6, 10, true]])
  expect(computeCounter([ev("2026-09-10T20:00:00Z", 5), ev("2026-09-17T20:00:00Z", null, null)], NOW)).toMatchObject({ used: 6, left: 4, estimated: true })

  // 10/10 done, next one booked as "_/10": a new package, 1 of 10.
  const fresh = computeCounter([ev("2026-09-10T20:00:00Z", 10), ev("2026-10-01T20:00:00Z", null, 10, { needsPayment: true })], NOW)
  expect(fresh).toMatchObject({ used: 0, size: 10, left: 10, packageDone: false, paymentDue: true })
})

test("counter: a finished package with nothing booked, and payment due only while recent", () => {
  expect(computeCounter([ev("2026-09-17T20:00:00Z", 10)], NOW)).toMatchObject({ used: 10, left: 0, packageDone: true, next: null })
  // A flag from months ago does not nag; one on an upcoming session does; marked paid it stops.
  expect(computeCounter([ev("2026-05-01T20:00:00Z", 3, 10, { needsPayment: true })], NOW).paymentDue).toBe(false)
  expect(computeCounter([ev("2026-10-01T20:00:00Z", 3, 10, { needsPayment: true })], NOW).paymentDue).toBe(true)
  expect(computeCounter([ev("2026-10-01T20:00:00Z", 3, 10, { needsPayment: true, paidOverride: true })], NOW).paymentDue).toBe(false)
  // Nothing counted anywhere: no invented numbers.
  expect(computeCounter([ev("2026-10-01T20:00:00Z", null, null)], NOW)).toMatchObject({ used: null, left: null })
})

// ---------- reading a feed into the database ----------

const iso = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
const day = (n: number, hour = 18) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + n)
  d.setUTCHours(hour, 0, 0, 0)
  return d
}
const vevent = (uid: string, when: Date, title: string, extra: string[] = []) =>
  ["BEGIN:VEVENT", `UID:${uid}`, `DTSTART:${iso(when)}`, `DTEND:${iso(new Date(when.getTime() + 3600_000))}`, `SUMMARY:${title}`, ...extra, "END:VEVENT"].join("\r\n")
const feed = (...events: string[]) => ["BEGIN:VCALENDAR", ...events, "END:VCALENDAR"].join("\r\n")

test.beforeAll(async () => {
  coachId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-coach@dev.local" } })).id
  clientId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })).id
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { tourSeenAt: new Date() } })
})
const wipe = async () => {
  await prisma.sessionEvent.deleteMany({ where: { coachId } })
  await prisma.clientAlias.deleteMany({ where: { coachId } })
  await prisma.sessionSyncState.deleteMany({ where: { coachId } })
}
test.afterAll(async () => {
  await wipe()
  await prisma.$disconnect()
})
test.beforeEach(wipe)

test("sync keeps sessions and drops the rest of the calendar", async () => {
  const text = feed(
    vevent("s1", day(-14), "Personal Training 1HR 4/10", ["ATTENDEE;CN=P:mailto:playwright-client@dev.local"]),
    vevent("s2", day(-7), "Personal Training 1HR 5/10", ["ATTENDEE;CN=P:mailto:playwright-client@dev.local"]),
    vevent("s3", day(3), "Personal Training 1HR 6/10", ["ATTENDEE;CN=P:mailto:playwright-client@dev.local"]),
    vevent("q1", day(2), "Mystery Person: 1 Hour Personal Training 2/10"), // looks like a session, nobody matches
    vevent("n1", day(1), "CrossFit: 6:00 PM"),
    vevent("n2", day(1, 12), "Bike - 8-10 deliveries - $150+"),
    vevent("n3", day(4), "Dentist"),
    vevent("r1", day(5), "Playwright Workout 60min 7/10", ["RRULE:FREQ=WEEKLY"]),
  )
  const report = await syncCalendar(coachId, { icsText: text })
  expect(report).toMatchObject({ fetched: 8, kept: 4, matched: 3, needsReview: 1, dropped: 3, recurringSkipped: 1, removed: 0 })

  const rows = await prisma.sessionEvent.findMany({ where: { coachId }, orderBy: { startsAt: "asc" } })
  expect(rows.map((r) => r.uid)).toEqual(["s1", "s2", "q1", "s3"])
  expect(rows[0]).toMatchObject({ clientIds: [clientId], matchedBy: "email", packageIndex: 4, packageSize: 10 })
  expect(rows[2].clientIds).toEqual([]) // the mystery one waits for review
  // Nothing else on the calendar was stored.
  expect(await prisma.sessionEvent.count({ where: { coachId, title: { contains: "CrossFit" } } })).toBe(0)

  // Reading again changes nothing, and a deleted event goes.
  await syncCalendar(coachId, { icsText: text })
  expect(await prisma.sessionEvent.count({ where: { coachId } })).toBe(4)
  const less = feed(
    vevent("s1", day(-14), "Personal Training 1HR 4/10", ["ATTENDEE;CN=P:mailto:playwright-client@dev.local"]),
    vevent("s2", day(-7), "Personal Training 1HR 5/10", ["ATTENDEE;CN=P:mailto:playwright-client@dev.local"]),
  )
  const r2 = await syncCalendar(coachId, { icsText: less })
  expect(r2.removed).toBe(2)
  expect(await prisma.sessionEvent.count({ where: { coachId } })).toBe(2)
})

test("what the coach assigned or ignored by hand survives the next read", async () => {
  const text = feed(vevent("q1", day(2), "Mystery Person: 1 Hour Personal Training 2/10"), vevent("q2", day(3), "Other Mystery: 1 Hour Personal Training"))
  await syncCalendar(coachId, { icsText: text })
  const [q1, q2] = await prisma.sessionEvent.findMany({ where: { coachId }, orderBy: { startsAt: "asc" } })
  await prisma.sessionEvent.update({ where: { id: q1.id }, data: { clientIds: [clientId], matchedBy: "manual" } })
  await prisma.sessionEvent.update({ where: { id: q2.id }, data: { clientIds: [], matchedBy: "ignored" } })

  const r = await syncCalendar(coachId, { icsText: text })
  expect(r.matched).toBe(1)
  expect(r.needsReview).toBe(0) // the ignored one is not asked about again
  const after = await prisma.sessionEvent.findMany({ where: { coachId }, orderBy: { startsAt: "asc" } })
  expect(after[0]).toMatchObject({ clientIds: [clientId], matchedBy: "manual" })
  expect(after[1]).toMatchObject({ clientIds: [], matchedBy: "ignored" })
})

test("a broken or empty feed never wipes what we already hold", async () => {
  await syncCalendar(coachId, { icsText: feed(vevent("s1", day(3), "Personal Training 1HR 6/10", ["ATTENDEE;CN=P:mailto:playwright-client@dev.local"])) })
  await expect(syncCalendar(coachId, { icsText: feed() })).rejects.toThrow(/came back empty/)
  expect(await prisma.sessionEvent.count({ where: { coachId } })).toBe(1)
  const state = await prisma.sessionSyncState.findUniqueOrThrow({ where: { coachId } })
  expect(state.lastError).toMatch(/came back empty/)
})

// ---------- what each side sees ----------

async function signInAsClient(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

test("the client sees their next session, sessions left, and payment due", async ({ browser }) => {
  await syncCalendar(coachId, {
    icsText: feed(
      vevent("s1", day(-14), "Personal Training 1HR 6/10", ["ATTENDEE;CN=P:mailto:playwright-client@dev.local"]),
      vevent("s2", day(-7), "Personal Training 1HR 7/10", ["ATTENDEE;CN=P:mailto:playwright-client@dev.local"]),
      vevent("s3", day(3), "Personal Training 1HR 8/10 _needspayment", ["ATTENDEE;CN=P:mailto:playwright-client@dev.local"]),
    ),
  })
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signInAsClient(page)

  const card = page.getByLabel("Your sessions")
  await expect(card).toBeVisible()
  await expect(card.getByText("3 of 10")).toBeVisible() // 7 used, 3 left
  await expect(card.getByText(/sessions left/)).toBeVisible()
  await expect(card.getByText("Payment due")).toBeVisible()
  // The next session is shown as a real date and time.
  await expect(card.locator("p.text-2xl")).toContainText(/,/)
  await ctx.close()
})

test("a client with nothing on the calendar sees no sessions card", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signInAsClient(page)
  await expect(page.getByRole("heading", { name: /^Hi / })).toBeVisible()
  await expect(page.getByLabel("Your sessions")).toBeHidden()
  await ctx.close()
})

test("the coach's Sessions page: counts, a review list, and Mark paid", async ({ page }) => {
  await syncCalendar(coachId, {
    icsText: feed(
      vevent("s1", day(-7), "Personal Training 1HR 7/10", ["ATTENDEE;CN=P:mailto:playwright-client@dev.local"]),
      vevent("s2", day(3), "Personal Training 1HR 8/10 _needspayment", ["ATTENDEE;CN=P:mailto:playwright-client@dev.local"]),
      vevent("q1", day(2), "Murray: 1 Hour Personal Training 4/10"),
    ),
  })
  await page.goto("/coach/sessions")
  await page.waitForLoadState("networkidle")

  const row = page.getByRole("row", { name: /Playwright Client/ })
  await expect(row).toContainText("3 of 10")
  await expect(row).toContainText("due")

  // The unmatched session waits for the coach, who says who it is and to remember "murray".
  await expect(page.getByText("Murray: 1 Hour Personal Training 4/10")).toBeVisible()
  await page.getByLabel(/Who is "Murray/).selectOption({ label: "Playwright Client" })
  await page.getByLabel("Also match this word in future titles").fill("murray")
  await page.getByRole("button", { name: "Assign" }).click()
  await expect.poll(async () => (await prisma.sessionEvent.findFirstOrThrow({ where: { coachId, uid: "q1" } })).clientIds).toEqual([clientId])
  // Saved a moment after the assignment, so wait for it.
  await expect.poll(async () => (await prisma.clientAlias.findFirst({ where: { coachId, alias: "murray" } }))?.clientId).toBe(clientId)

  await page.reload()
  await page.waitForLoadState("networkidle")
  await page.getByRole("row", { name: /Playwright Client/ }).getByRole("button", { name: "Mark paid" }).click()
  await expect.poll(async () => (await prisma.sessionEvent.findFirstOrThrow({ where: { coachId, uid: "s2" } })).paidOverride).toBe(true)
})

test("only a coach can use the session tools", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  expect((await page.request.post("/api/sessions/sync")).status()).toBe(401)
  expect((await page.request.post("/api/sessions/assign", { data: { markPaid: true, clientId } })).status()).toBe(401)
  // The background refresh never errors for a stranger and never reads the calendar for them.
  expect((await page.request.post("/api/sessions/refresh")).status()).toBe(401)
  await ctx.close()
})
