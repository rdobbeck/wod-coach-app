import type Stripe from "stripe"
import { prisma } from "@/lib/prisma"
import { notifyUser } from "@/lib/notify"
import { dollars, type Method } from "./money"

/**
 * The payments ledger. Every way money can arrive ends up as a Payment row.
 * A payment that clears "payment due" does it through clearPaymentFlags, which
 * is the same thing as pressing Mark paid on the Sessions page.
 */

/** The calendar says "needs payment" on this client's recent sessions: mark them paid here. */
export const clearPaymentFlags = (coachId: string, clientId: string) =>
  prisma.sessionEvent.updateMany({
    where: { coachId, clientIds: { has: clientId }, needsPayment: true, startsAt: { gte: new Date(Date.now() - 14 * 86_400_000) } },
    data: { paidOverride: true },
  })

const who = async (clientId: string | null | undefined, fallback?: string | null) => {
  if (!clientId) return fallback ?? "Someone"
  const u = await prisma.user.findUnique({ where: { id: clientId }, select: { name: true, email: true } })
  return u?.name ?? u?.email ?? fallback ?? "A client"
}

/**
 * The client record for someone who paid without an account. An existing client
 * is credited (and brought back to active if they had gone quiet); a new email
 * gets a client record with no password. Nobody is signed in and no sign-in link
 * is handed out here: an email address is not proof of who is holding the
 * browser, so the coach sends the invite. Coach and other non-client accounts
 * are never attached.
 */
export async function ensureGuestClient(coachId: string, email: string, name?: string | null): Promise<{ clientId: string | null; created: boolean }> {
  const lower = email.trim().toLowerCase()
  const find = () => prisma.user.findFirst({ where: { email: { equals: lower, mode: "insensitive" } }, select: { id: true, role: true } })
  const link = (clientId: string) =>
    prisma.clientCoach.upsert({
      where: { clientId_coachId: { clientId, coachId } },
      update: { status: "ACTIVE" },
      create: { clientId, coachId, status: "ACTIVE" },
    })

  const existing = await find()
  if (existing) {
    if (existing.role !== "CLIENT") return { clientId: null, created: false }
    await link(existing.id)
    return { clientId: existing.id, created: false }
  }
  try {
    const u = await prisma.user.create({
      data: {
        email: lower,
        name: (name?.trim() || lower.split("@")[0]).slice(0, 80),
        role: "CLIENT",
        clientProfile: { create: {} },
        coaches: { create: { coachId, status: "ACTIVE" } },
      },
      select: { id: true },
    })
    return { clientId: u.id, created: true }
  } catch (e) {
    // Two payment events for the same new person at once: the other one made them.
    if ((e as { code?: string }).code !== "P2002") throw e
    const again = await find()
    if (again?.role === "CLIENT") {
      await link(again.id)
      return { clientId: again.id, created: false }
    }
    return { clientId: null, created: false }
  }
}

/**
 * Record a Stripe payment once Stripe says it is paid. Safe to call twice for
 * the same session, from the webhook and from the page the client lands on:
 * the second call finds the first and does nothing.
 */
export async function fulfillStripeSession(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return { created: false as const, reason: "not paid" }
  const meta = session.metadata ?? {}
  if (meta.kind !== "session_purchase" || !meta.coachId) return { created: false as const, reason: "not ours" }

  const existing = await prisma.payment.findUnique({ where: { stripeSessionId: session.id }, select: { id: true } })
  if (existing) return { created: false as const, reason: "already recorded", paymentId: existing.id }

  const email = session.customer_details?.email ?? session.customer_email ?? null
  // The client we sold to, or failing that a client of this coach with the email they paid under.
  let clientId: string | null = meta.clientId ?? null
  if (clientId) {
    const ok = await prisma.clientCoach.findFirst({ where: { coachId: meta.coachId, clientId }, select: { id: true } })
    if (!ok) clientId = null
  }
  if (!clientId && email) {
    const u = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, role: "CLIENT", coaches: { some: { coachId: meta.coachId } } },
      select: { id: true },
    })
    clientId = u?.id ?? null
  }

  // Paid through the public page with no account: make (or find) the client.
  // Also for someone already on the coach's list: it brings a client who had gone inactive back.
  let newAccount = false
  if (meta.guest === "1" && email) {
    const g = await ensureGuestClient(meta.coachId, email, session.customer_details?.name)
    clientId = g.clientId ?? clientId
    newAccount = g.created
  }

  const amountCents = session.amount_total ?? 0
  let paymentId: string
  try {
    const p = await prisma.payment.create({
      data: {
        coachId: meta.coachId,
        clientId,
        productId: meta.productId ?? null,
        description: meta.description || "Payment",
        amountCents,
        currency: session.currency ?? "usd",
        method: "STRIPE",
        status: "CONFIRMED",
        payerEmail: email,
        payerName: session.customer_details?.name ?? null,
        stripeSessionId: session.id,
        stripePaymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
        confirmedAt: new Date(),
      },
      select: { id: true },
    })
    paymentId = p.id
  } catch (e) {
    // The webhook and the success page raced and the other one won.
    if ((e as { code?: string }).code === "P2002") return { created: false as const, reason: "already recorded" }
    throw e
  }

  if (clientId) await clearPaymentFlags(meta.coachId, clientId)
  await notifyUser(meta.coachId, {
    title: "Payment received",
    body: newAccount
      ? `New client: ${await who(clientId, email)} paid ${dollars(amountCents)} for ${meta.description || "a session"}. Send them an invite.`
      : `${dollars(amountCents)} from ${await who(clientId, session.customer_details?.name ?? email)}: ${meta.description || "payment"}.`,
    url: clientId && newAccount ? `/coach/clients/${clientId}` : "/coach/payments",
    tag: `pay-${paymentId}`,
  })
  return { created: true as const, paymentId }
}

/** A client says they sent money by Venmo or bank. Amount and description come from the product, never the browser. */
export async function claimPayment(o: { coachId: string; clientId: string; productId: string; method: "VENMO" | "BANK" }) {
  const product = await prisma.product.findFirst({ where: { id: o.productId, coachId: o.coachId, active: true } })
  if (!product) return { ok: false as const, error: "That is not available." }

  // Tapping twice, or again an hour later, is still one claim.
  const open = await prisma.payment.findFirst({
    where: { coachId: o.coachId, clientId: o.clientId, productId: product.id, method: o.method, status: "PENDING", createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) } },
    select: { id: true },
  })
  if (open) return { ok: true as const, paymentId: open.id, duplicate: true }

  const p = await prisma.payment.create({
    data: {
      coachId: o.coachId,
      clientId: o.clientId,
      productId: product.id,
      description: product.name,
      amountCents: product.priceCents,
      method: o.method,
      status: "PENDING",
      payerEmail: (await prisma.user.findUnique({ where: { id: o.clientId }, select: { email: true } }))?.email ?? null,
    },
    select: { id: true },
  })
  await notifyUser(o.coachId, {
    title: "Payment to confirm",
    body: `${await who(o.clientId)} says they sent ${dollars(product.priceCents)} by ${o.method === "VENMO" ? "Venmo" : "bank"} for ${product.name}.`,
    url: "/coach/payments",
    tag: `claim-${p.id}`,
  })
  return { ok: true as const, paymentId: p.id, duplicate: false }
}

/** The coach confirms (money arrived) or rejects (it did not) a pending claim. */
export async function decidePayment(coachId: string, id: string, confirm: boolean) {
  const p = await prisma.payment.findFirst({ where: { id, coachId, status: "PENDING" } })
  if (!p) return { ok: false as const }
  await prisma.payment.update({ where: { id }, data: { status: confirm ? "CONFIRMED" : "REJECTED", confirmedAt: confirm ? new Date() : null } })
  if (confirm && p.clientId) {
    await clearPaymentFlags(coachId, p.clientId)
    await notifyUser(p.clientId, { title: "Payment received", body: `Thanks. ${p.description} is paid.`, url: "/client/pay", tag: `paid-${p.id}` })
  }
  return { ok: true as const }
}

/** A payment the coach records themselves: cash in hand, or a Venmo they already saw arrive. */
export async function recordManual(o: {
  coachId: string
  clientId: string | null
  amountCents: number
  method: Method
  description: string
  note?: string | null
  at?: Date
}) {
  const at = o.at ?? new Date()
  const p = await prisma.payment.create({
    data: {
      coachId: o.coachId,
      clientId: o.clientId,
      description: o.description,
      amountCents: o.amountCents,
      method: o.method,
      status: "CONFIRMED",
      note: o.note ?? null,
      createdAt: at,
      confirmedAt: at,
    },
    select: { id: true },
  })
  if (o.clientId) await clearPaymentFlags(o.coachId, o.clientId)
  return p.id
}

// ---------- export for the accountant ----------

// A cell that starts with = + - @ can run as a formula when opened in a spreadsheet.
const cell = (v: string | number | null | undefined) => {
  let s = v == null ? "" : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function paymentsCsv(
  rows: { createdAt: Date; clientName: string | null; description: string; method: string; status: string; amountCents: number; payerEmail: string | null; note: string | null }[]
) {
  const head = ["Date", "Client", "Description", "Method", "Status", "Amount (USD)", "Payer email", "Note"]
  const lines = rows.map((r) =>
    [r.createdAt.toISOString().slice(0, 10), r.clientName, r.description, r.method, r.status, (r.amountCents / 100).toFixed(2), r.payerEmail, r.note].map(cell).join(",")
  )
  return [head.join(","), ...lines].join("\n") + "\n"
}
