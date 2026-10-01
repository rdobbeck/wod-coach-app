/**
 * Mirror a coach's app products into Stripe Products on the DTS account and set
 * up the promo coupons and codes. Idempotent: existing links, coupons (by name)
 * and codes are reused. Dry run unless --apply.
 *   npx tsx --env-file=.env.local scripts/stripe-products.ts <coach email> [--apply]
 */
import { PrismaClient } from "@prisma/client"
import Stripe from "stripe"

const DTS_ACCOUNT = "acct_18zaRuBAti4xomeC"
const FIRST_SESSION = "first session"

type CouponPlan = {
  name: string
  coupon: Omit<Stripe.CouponCreateParams, "name" | "applies_to"> & { appliesToFirstSession?: boolean }
  codes: { code: string; firstTimeOnly?: boolean; expiresInDays?: number }[]
}
const PLAN: CouponPlan[] = [
  { name: "10% off", coupon: { percent_off: 10, duration: "once" }, codes: [{ code: "FRIEND10" }, { code: "MAGMILE" }] },
  { name: "Referral: first session $50", coupon: { amount_off: 9_000, currency: "usd", duration: "once", appliesToFirstSession: true }, codes: [{ code: "REFER50", firstTimeOnly: true }] },
  { name: "Group session credit", coupon: { amount_off: 2_500, currency: "usd", duration: "once", appliesToFirstSession: true }, codes: [{ code: "GROUP25" }] },
  // Past-client email went out 2026-10-01; the code expires 30 days after that run.
  { name: "Welcome back 15%", coupon: { percent_off: 15, duration: "once" }, codes: [{ code: "COMEBACK", expiresInDays: 30 }] },
]

const email = process.argv[2]
const apply = process.argv.includes("--apply")
if (!email) throw new Error("usage: stripe-products.ts <coach email> [--apply]")
const prisma = new PrismaClient({ datasources: { db: { url: process.env.POSTGRES_URL_NON_POOLING } } })
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-02-24.acacia" })
const usd = (c: number) => `$${(c / 100).toFixed(2)}`

async function main() {
  const account = await stripe.accounts.retrieve()
  console.log(`Stripe account: ${account.settings?.dashboard?.display_name ?? account.id} (${account.id}), ${process.env.STRIPE_SECRET_KEY!.startsWith("sk_live") ? "LIVE" : "test"}`)
  if (account.id !== DTS_ACCOUNT) throw new Error(`Refusing: expected the DTS account ${DTS_ACCOUNT}`)

  const coach = await prisma.user.findFirstOrThrow({ where: { email: { equals: email, mode: "insensitive" }, role: "COACH" }, select: { id: true } })
  const products = await prisma.product.findMany({ where: { coachId: coach.id, active: true }, orderBy: { sortOrder: "asc" } })

  console.log("\nProducts")
  let firstSessionStripeId: string | null = null
  for (const p of products) {
    let stripeId = p.stripeProductId
    if (stripeId) {
      const existing = await stripe.products.retrieve(stripeId).catch(() => null)
      if (existing && !existing.deleted) {
        console.log(`  keep    ${p.name.padEnd(22)} ${usd(p.priceCents)}  ${stripeId}`)
      } else {
        console.log(`  relink  ${p.name.padEnd(22)} ${usd(p.priceCents)}  (${stripeId} is gone)`)
        stripeId = null
      }
    }
    if (!stripeId) {
      console.log(`  create  ${p.name.padEnd(22)} ${usd(p.priceCents)}`)
      if (apply) {
        const created = await stripe.products.create({
          name: p.name,
          ...(p.description ? { description: p.description } : {}),
          metadata: { appProductId: p.id, sessions: String(p.sessions) },
        })
        stripeId = created.id
        await prisma.product.update({ where: { id: p.id }, data: { stripeProductId: stripeId } })
      }
    }
    if (p.name.toLowerCase() === FIRST_SESSION) firstSessionStripeId = stripeId
  }

  console.log("\nCoupons and codes")
  const coupons = (await stripe.coupons.list({ limit: 100 })).data.filter((c) => c.valid)
  for (const plan of PLAN) {
    let coupon = coupons.find((c) => c.name === plan.name) ?? null
    const { appliesToFirstSession, ...params } = plan.coupon
    const scope = appliesToFirstSession ? " (First session only)" : ""
    if (coupon) {
      console.log(`  keep    coupon ${plan.name}${scope}  ${coupon.id}`)
    } else {
      console.log(`  create  coupon ${plan.name}${scope}`)
      if (apply) {
        if (appliesToFirstSession && !firstSessionStripeId) throw new Error("First session has no Stripe product yet")
        coupon = await stripe.coupons.create({
          name: plan.name,
          ...params,
          ...(appliesToFirstSession ? { applies_to: { products: [firstSessionStripeId!] } } : {}),
        })
      }
    }
    for (const c of plan.codes) {
      const have = (await stripe.promotionCodes.list({ code: c.code, limit: 1 })).data[0]
      if (have) {
        console.log(`  keep    code   ${c.code.padEnd(10)} on ${have.coupon.name ?? have.coupon.id}`)
        continue
      }
      const expiresAt = c.expiresInDays ? Math.floor(Date.now() / 1000) + c.expiresInDays * 86_400 : undefined
      console.log(
        `  create  code   ${c.code.padEnd(10)} on ${plan.name}${c.firstTimeOnly ? ", first-time customers only" : ""}${
          expiresAt ? `, expires ${new Date(expiresAt * 1000).toISOString().slice(0, 10)}` : ""
        }`
      )
      if (apply && coupon) {
        await stripe.promotionCodes.create({
          coupon: coupon.id,
          code: c.code,
          ...(c.firstTimeOnly ? { restrictions: { first_time_transaction: true } } : {}),
          ...(expiresAt ? { expires_at: expiresAt } : {}),
        })
      }
    }
  }
  console.log(apply ? "\nAPPLIED" : "\nDRY RUN (add --apply)")
}

main()
  .catch((e) => console.log("ERR", String(e.message ?? e).split("\n").filter(Boolean).pop()))
  .finally(() => prisma.$disconnect())
