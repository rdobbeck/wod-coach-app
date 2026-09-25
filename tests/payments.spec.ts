import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import Stripe from "stripe"
import { dbUrl } from "../lib/db-url"
import { dollars, parseDollars } from "../lib/pay/money"
import { checkoutParams } from "../lib/pay/checkout"
import { claimPayment, decidePayment, fulfillStripeSession, paymentsCsv, recordManual } from "../lib/pay/ledger"

/**
 * Paying for sessions: prices come from the server, a Stripe payment is
 * recorded exactly once, Venmo and bank claims wait for the coach, and every
 * way of paying clears "payment due". No test touches real money.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })
const SECRET = process.env.STRIPE_WEBHOOK_SECRET!
let coachId = ""
let clientId = ""
let productId = ""
const iso = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")

const wipe = async () => {
  await prisma.payment.deleteMany({ where: { coachId } })
  await prisma.product.deleteMany({ where: { coachId } })
  await prisma.sessionEvent.deleteMany({ where: { coachId } })
  await prisma.coachProfile.update({ where: { userId: coachId }, data: { venmoHandle: null, payInstructions: null } })
}
test.beforeAll(async () => {
  coachId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-coach@dev.local" } })).id
  clientId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })).id
  await prisma.clientProfile.update({ where: { userId: clientId }, data: { tourSeenAt: new Date() } })
  await prisma.coachProfile.upsert({ where: { userId: coachId }, update: {}, create: { userId: coachId } })
})
test.beforeEach(async () => {
  await wipe()
  // One test makes the client inactive; a failed run must not leave them that way for the next.
  await prisma.clientCoach.update({ where: { clientId_coachId: { clientId, coachId } }, data: { status: "ACTIVE" } })
  productId = (await prisma.product.create({ data: { coachId, name: "Gym pod session", description: "60 minutes", priceCents: 12_000, sessions: 1 } })).id
})
test.afterAll(async () => {
  await wipe()
  await prisma.$disconnect()
})

/** A payment that needs paying: the coach's calendar flags the client's next session. */
async function flagSession() {
  const when = new Date(Date.now() + 2 * 86_400_000)
  return prisma.sessionEvent.create({
    data: { coachId, uid: `flag-${Date.now()}`, clientIds: [clientId], title: "Personal Training 1HR 3/10 _needspayment", startsAt: when, packageIndex: 3, packageSize: 10, needsPayment: true },
  })
}

const stripeSession = (over: Record<string, unknown> = {}) =>
  ({
    id: `cs_test_${Math.random().toString(36).slice(2)}`,
    payment_status: "paid",
    amount_total: 12_000,
    currency: "usd",
    payment_intent: "pi_test_1",
    customer_details: { email: "playwright-client@dev.local", name: "Playwright Client" },
    metadata: { kind: "session_purchase", coachId, clientId, productId, description: "Gym pod session" },
    ...over,
  }) as unknown as Stripe.Checkout.Session

// ---------- money and the checkout request ----------

test("prices: dollars in, cents stored, nothing silly accepted", () => {
  expect(parseDollars("120")).toBe(12_000)
  expect(parseDollars("$1,000.50")).toBe(100_050)
  expect(parseDollars(99.99)).toBe(9_999)
  expect(parseDollars("0.5")).toBeNull() // under $1
  expect(parseDollars("5000.01")).toBeNull() // over $5,000
  expect(parseDollars("abc")).toBeNull()
  expect(parseDollars("")).toBeNull()
  expect(dollars(12_000)).toBe("$120")
  expect(dollars(100_050)).toBe("$1,000.50")
})

test("checkout: the amount is the product's, and the payment can be traced back", () => {
  const p = checkoutParams({
    product: { id: "prod1", name: "10-session package", description: "Ten sessions", priceCents: 100_000, sessions: 10 },
    coachId: "coach1", clientId: "client1", email: "a@b.co", origin: "https://wod.coach", successPath: "/client/pay", cancelPath: "/client/pay",
  })
  expect(p.mode).toBe("payment")
  expect(p.line_items![0].price_data!.unit_amount).toBe(100_000)
  expect(p.metadata).toMatchObject({ kind: "session_purchase", coachId: "coach1", clientId: "client1", productId: "prod1" })
  expect(p.customer_email).toBe("a@b.co")
  expect(p.success_url).toBe("https://wod.coach/client/pay?paid=1&session_id={CHECKOUT_SESSION_ID}")
  // A product whose price was somehow set out of range never reaches Stripe.
  expect(() => checkoutParams({ product: { id: "x", name: "x", description: null, priceCents: 5, sessions: 1 }, coachId: "c", origin: "https://wod.coach", successPath: "/p", cancelPath: "/p" })).toThrow(/range/)
})

// ---------- recording a Stripe payment ----------

test("a paid Stripe session is recorded once, clears payment due, and names the client", async () => {
  const flagged = await flagSession()
  const s = stripeSession()
  const first = await fulfillStripeSession(s)
  expect(first).toMatchObject({ created: true })
  // The webhook and the page the client lands on both call this: the second finds the first.
  expect(await fulfillStripeSession(s)).toMatchObject({ created: false })
  const rows = await prisma.payment.findMany({ where: { coachId } })
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ clientId, amountCents: 12_000, method: "STRIPE", status: "CONFIRMED", stripePaymentIntent: "pi_test_1", description: "Gym pod session" })
  expect((await prisma.sessionEvent.findUniqueOrThrow({ where: { id: flagged.id } })).paidOverride).toBe(true)
})

test("Stripe sessions that are unpaid, not ours, or for someone else's client are handled safely", async () => {
  expect(await fulfillStripeSession(stripeSession({ payment_status: "unpaid" }))).toMatchObject({ created: false })
  expect(await fulfillStripeSession(stripeSession({ metadata: { description: "something else" } }))).toMatchObject({ created: false })
  expect(await prisma.payment.count({ where: { coachId } })).toBe(0)

  // A client id that is not this coach's is not trusted: the email decides, and here it matches nobody.
  const stranger = stripeSession({ metadata: { kind: "session_purchase", coachId, clientId: "not-a-real-client", description: "x" }, customer_details: { email: "nobody@example.com" } })
  await fulfillStripeSession(stranger)
  expect((await prisma.payment.findFirstOrThrow({ where: { coachId } })).clientId).toBeNull()
})

// ---------- "I sent it" ----------

test("a Venmo claim uses the product's price, waits for the coach, and one tap is one claim", async () => {
  const a = await claimPayment({ coachId, clientId, productId, method: "VENMO" })
  const b = await claimPayment({ coachId, clientId, productId, method: "VENMO" })
  expect(a).toMatchObject({ ok: true, duplicate: false })
  expect(b).toMatchObject({ ok: true, duplicate: true })
  const rows = await prisma.payment.findMany({ where: { coachId } })
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ status: "PENDING", amountCents: 12_000, method: "VENMO", description: "Gym pod session" })

  // A product that is switched off cannot be claimed.
  await prisma.product.update({ where: { id: productId }, data: { active: false } })
  expect(await claimPayment({ coachId, clientId, productId, method: "BANK" })).toMatchObject({ ok: false })
})

test("confirming a claim clears payment due; rejecting does not; neither can happen twice", async () => {
  const flagged = await flagSession()
  const claim = await claimPayment({ coachId, clientId, productId, method: "BANK" })
  const id = (claim as { paymentId: string }).paymentId
  // Saying you sent it does not clear anything by itself.
  expect((await prisma.sessionEvent.findUniqueOrThrow({ where: { id: flagged.id } })).paidOverride).toBe(false)

  expect(await decidePayment(coachId, id, true)).toEqual({ ok: true })
  expect(await decidePayment(coachId, id, false)).toEqual({ ok: false }) // already decided
  expect((await prisma.payment.findUniqueOrThrow({ where: { id } })).status).toBe("CONFIRMED")
  expect((await prisma.sessionEvent.findUniqueOrThrow({ where: { id: flagged.id } })).paidOverride).toBe(true)

  const other = (await claimPayment({ coachId, clientId, productId, method: "VENMO" })) as { paymentId: string }
  await decidePayment(coachId, other.paymentId, false)
  expect((await prisma.payment.findUniqueOrThrow({ where: { id: other.paymentId } })).status).toBe("REJECTED")
})

test("a payment the coach records themselves counts straight away", async () => {
  const flagged = await flagSession()
  const id = await recordManual({ coachId, clientId, amountCents: 10_000, method: "CASH", description: "Off-site session" })
  expect((await prisma.payment.findUniqueOrThrow({ where: { id } })).status).toBe("CONFIRMED")
  expect((await prisma.sessionEvent.findUniqueOrThrow({ where: { id: flagged.id } })).paidOverride).toBe(true)
})

test("the spreadsheet export cannot be turned into a formula", () => {
  const csv = paymentsCsv([
    { createdAt: new Date("2026-09-24T12:00:00Z"), clientName: 'Smith, "Bob"', description: "=HYPERLINK(\"http://evil\")", method: "CASH", status: "CONFIRMED", amountCents: 12_050, payerEmail: null, note: "@note" },
  ])
  const [head, row] = csv.trim().split("\n")
  expect(head).toBe("Date,Client,Description,Method,Status,Amount (USD),Payer email,Note")
  expect(row).toContain('"Smith, ""Bob"""')
  expect(row).toContain("'=HYPERLINK") // neutralised with a leading apostrophe
  expect(row).toContain("'@note")
  expect(row).toContain("120.50")
})

// ---------- the Stripe webhook, signed the way Stripe signs it ----------

const signer = new Stripe("sk_test_signing_only")
const post = (page: Page, event: object, secret = SECRET) => {
  const payload = JSON.stringify(event)
  return page.request.post("/api/webhooks/stripe", {
    headers: { "Content-Type": "application/json", "stripe-signature": signer.webhooks.generateTestHeaderString({ payload, secret }) },
    data: payload,
  })
}

test("the webhook records a payment once, refuses a bad signature, and marks a refund", async ({ page }) => {
  const s = stripeSession({ id: "cs_test_webhook_1", payment_intent: "pi_webhook_1" })
  const event = { id: "evt_1", object: "event", type: "checkout.session.completed", data: { object: s } }

  expect((await post(page, event)).status()).toBe(200)
  expect((await post(page, event)).status()).toBe(200) // Stripe retries; still one payment
  expect(await prisma.payment.count({ where: { coachId, stripeSessionId: "cs_test_webhook_1" } })).toBe(1)

  expect((await post(page, { ...event, id: "evt_bad" }, "whsec_wrong")).status()).toBe(400)

  const refund = { id: "evt_2", object: "event", type: "charge.refunded", data: { object: { id: "ch_1", object: "charge", payment_intent: "pi_webhook_1", amount: 12_000, amount_refunded: 12_000, refunded: true } } }
  expect((await post(page, refund)).status()).toBe(200)
  expect((await prisma.payment.findFirstOrThrow({ where: { coachId, stripeSessionId: "cs_test_webhook_1" } })).status).toBe("REFUNDED")
})

// ---------- what each side sees ----------

async function signInAsClient(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

test("the client picks something, sees how to pay, says 'I sent it', and sees it waiting", async ({ browser }) => {
  await prisma.coachProfile.update({ where: { userId: coachId }, data: { venmoHandle: "ryan-pt", payInstructions: "Zelle: pay@example.com" } })
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signInAsClient(page)

  // A way in from Today, since this client has no calendar sessions.
  await page.getByRole("link", { name: /Pay or buy sessions/ }).click()
  await expect(page.getByRole("heading", { name: "Pay" })).toBeVisible()
  await page.getByRole("button", { name: /Gym pod session/ }).click()
  await expect(page.getByText("@ryan-pt")).toBeVisible()
  await expect(page.getByText("Zelle: pay@example.com")).toBeVisible()
  await expect(page.getByRole("link", { name: "Open Venmo" })).toHaveAttribute("href", /venmo\.com\/ryan-pt\?txn=pay&amount=120\.00/)
  if (!process.env.STRIPE_SECRET_KEY) await expect(page.getByRole("button", { name: /by card/ })).toBeHidden() // no card without Stripe

  await page.getByRole("button", { name: "I sent it" }).first().click()
  await expect.poll(() => prisma.payment.count({ where: { coachId, clientId, status: "PENDING" } })).toBe(1)
  await page.reload()
  await expect(page.getByText("Waiting for your coach to confirm")).toBeVisible()
  await ctx.close()
})

test("the coach confirms a claim on the Payments page and the client's payment due clears", async ({ page }) => {
  const flagged = await flagSession()
  await claimPayment({ coachId, clientId, productId, method: "VENMO" })
  await page.goto("/coach/payments")
  await page.waitForLoadState("networkidle")

  await expect(page.getByText(/Playwright Client says they sent \$120 by Venmo/)).toBeVisible()
  await page.getByRole("button", { name: "It arrived" }).click()
  await expect.poll(async () => (await prisma.payment.findFirstOrThrow({ where: { coachId } })).status).toBe("CONFIRMED")
  expect((await prisma.sessionEvent.findUniqueOrThrow({ where: { id: flagged.id } })).paidOverride).toBe(true)
})

test("the coach records cash, sets prices and payment details, and exports the ledger", async ({ page }) => {
  await prisma.product.deleteMany({ where: { coachId } }) // start empty to see the one-tap setup
  await page.goto("/coach/payments")
  await page.waitForLoadState("networkidle")

  await page.getByRole("button", { name: "Add my usual three" }).click()
  // Wait for the rows themselves: the hint next to the button already names the package.
  await expect.poll(() => prisma.product.count({ where: { coachId } })).toBe(3)
  await expect(page.getByRole("listitem").filter({ hasText: "Off-site session" })).toBeVisible()

  await page.getByLabel("Venmo handle").fill("@ryan-pt")
  await page.getByLabel("Bank or Zelle details").fill("Zelle: pay@example.com")
  await page.getByRole("button", { name: "Save" }).click()
  await expect.poll(async () => (await prisma.coachProfile.findUniqueOrThrow({ where: { userId: coachId } })).venmoHandle).toBe("ryan-pt")

  await page.getByLabel("Client").selectOption({ label: "Playwright Client" })
  await page.getByLabel("Amount").fill("100")
  await page.getByLabel("What it was for").fill("Cash for last session")
  await page.getByRole("button", { name: "Record" }).click()
  await expect(page.getByRole("cell", { name: "Cash for last session" })).toBeVisible({ timeout: 15_000 })

  const csv = await (await page.request.get(`/api/payments/export?year=${new Date().getUTCFullYear()}`)).text()
  expect(csv).toContain("Cash for last session")
  expect(csv).toContain("100.00")
})

test("a bad Venmo handle, an out of range price, and the wrong role are all refused", async ({ page, browser }) => {
  expect((await page.request.patch("/api/coach/settings", { data: { venmoHandle: "bad handle!<script>" } })).status()).toBe(400)
  expect((await page.request.post("/api/products", { data: { name: "Free", price: "0" } })).status()).toBe(400)
  expect((await page.request.post("/api/payments", { data: { amount: "9999", method: "CASH", description: "x" } })).status()).toBe(400)
  expect((await page.request.post("/api/payments", { data: { amount: "50", method: "STRIPE", description: "x" } })).status()).toBe(400) // only Stripe can say it was Stripe

  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const anon = await ctx.newPage()
  expect((await anon.request.post("/api/payments", { data: { amount: "50", method: "CASH", description: "x" } })).status()).toBe(401)
  expect((await anon.request.post("/api/pay/claim", { data: { productId, method: "VENMO" } })).status()).toBe(401)
  expect((await anon.request.get("/api/payments/export")).status()).toBe(401)
  await signInAsClient(anon)
  // A client cannot record payments or see the ledger.
  expect((await anon.request.post("/api/payments", { data: { amount: "50", method: "CASH", description: "x" } })).status()).toBe(401)
  expect((await anon.request.get("/api/payments/export")).status()).toBe(401)
  await ctx.close()
})

// ---------- paying without an account ----------

const guestEmails = ["pw-guest-new@example.com", "pw-guest-race@example.com"]
const guestSession = (email: string, over: Record<string, unknown> = {}) =>
  stripeSession({
    customer_details: { email, name: "Pat Guest" },
    metadata: { kind: "session_purchase", coachId, productId, description: "Gym pod session", guest: "1" },
    ...over,
  })
const dropGuests = () => prisma.user.deleteMany({ where: { email: { in: guestEmails } } })

test("a first-time buyer becomes a client with no password, and the coach is told to invite them", async () => {
  await dropGuests()
  const r = await fulfillStripeSession(guestSession("pw-guest-new@example.com"))
  expect(r).toMatchObject({ created: true })
  const u = await prisma.user.findUniqueOrThrow({ where: { email: "pw-guest-new@example.com" }, include: { clientProfile: true, coaches: true } })
  expect(u).toMatchObject({ role: "CLIENT", name: "Pat Guest", hashedPassword: null })
  expect(u.clientProfile).not.toBeNull()
  expect(u.coaches).toHaveLength(1)
  expect(u.coaches[0]).toMatchObject({ coachId, status: "ACTIVE" })
  expect((await prisma.payment.findFirstOrThrow({ where: { coachId } })).clientId).toBe(u.id)
  await dropGuests()
})

test("two payment events for the same new person make one client, not two", async () => {
  await dropGuests()
  await Promise.all([fulfillStripeSession(guestSession("pw-guest-race@example.com")), fulfillStripeSession(guestSession("pw-guest-race@example.com"))])
  expect(await prisma.user.count({ where: { email: "pw-guest-race@example.com" } })).toBe(1)
  expect(await prisma.payment.count({ where: { coachId } })).toBe(2) // two different payments, one person
  await dropGuests()
})

test("an existing client who pays from the public page is credited and brought back to active", async () => {
  const flagged = await flagSession()
  await prisma.clientCoach.update({ where: { clientId_coachId: { clientId, coachId } }, data: { status: "INACTIVE" } })
  await fulfillStripeSession(guestSession("playwright-client@dev.local"))
  expect((await prisma.clientCoach.findUniqueOrThrow({ where: { clientId_coachId: { clientId, coachId } } })).status).toBe("ACTIVE")
  expect((await prisma.payment.findFirstOrThrow({ where: { coachId } })).clientId).toBe(clientId)
  expect(await prisma.user.count({ where: { email: "playwright-client@dev.local" } })).toBe(1)
  expect((await prisma.sessionEvent.findUniqueOrThrow({ where: { id: flagged.id } })).paidOverride).toBe(true)
})

test("a payment can never attach itself to a coach's own account", async () => {
  await fulfillStripeSession(guestSession("playwright-coach@dev.local"))
  const p = await prisma.payment.findFirstOrThrow({ where: { coachId } })
  expect(p.clientId).toBeNull()
  expect(await prisma.clientCoach.count({ where: { clientId: coachId } })).toBe(0)
})

test("the public buy endpoint refuses bad input before it ever reaches Stripe", async ({ browser }) => {
  await prisma.coachProfile.update({ where: { userId: coachId }, data: { slug: "pw-coach" } })
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  const call = (data: object) => page.request.post("/api/pay/guest", { data })

  expect((await call({ slug: "pw-coach", productId, email: "not an email" })).status()).toBe(400)
  expect((await call({ slug: "pw-coach", productId })).status()).toBe(400)
  expect((await call({ slug: "no-such-coach", productId, email: "a@b.co" })).status()).toBe(404)
  expect((await call({ slug: "pw-coach", productId: "nope", email: "a@b.co" })).status()).toBe(404)
  await prisma.product.update({ where: { id: productId }, data: { active: false } })
  expect((await call({ slug: "pw-coach", productId, email: "a@b.co" })).status()).toBe(404) // switched off
  await ctx.close()
  await prisma.coachProfile.update({ where: { userId: coachId }, data: { slug: null } })
})

test("the public page lists what is for sale without signing in, and the coach's page links to it", async ({ browser }) => {
  await prisma.coachProfile.update({ where: { userId: coachId }, data: { slug: "pw-coach" } })
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()

  await page.goto("/pay/pw-coach")
  await expect(page.getByRole("heading", { name: /Train with/ })).toBeVisible()
  await expect(page.getByRole("radio", { name: /Gym pod session/ })).toBeVisible()
  await expect(page.getByRole("radio", { name: /\$120/ })).toBeVisible()
  // Nothing is payable until an email is given.
  const pay = page.getByRole("button", { name: /^Pay/ })
  await expect(pay).toBeDisabled()
  await page.getByLabel(/Your email/).fill("someone@example.com")
  await expect(pay).toBeEnabled()

  // The coach's own page offers it, and stops offering it when nothing is for sale.
  await page.goto("/c/pw-coach")
  await expect(page.getByRole("link", { name: "Book and pay" })).toBeVisible()
  await prisma.product.update({ where: { id: productId }, data: { active: false } })
  await page.goto("/c/pw-coach")
  await expect(page.getByRole("link", { name: "Book and pay" })).toBeHidden()

  expect((await page.request.get("/pay/no-such-coach")).status()).toBe(404)
  await page.goto("/pay/pw-coach/thanks")
  await expect(page.getByRole("heading", { name: "Payment on its way" })).toBeVisible() // no session id, no error
  await ctx.close()
  await prisma.coachProfile.update({ where: { userId: coachId }, data: { slug: null } })
})
