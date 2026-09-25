import Link from "next/link"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import PayOptions from "@/components/client/PayOptions"
import { dollars, METHOD_LABEL, type Method } from "@/lib/pay/money"
import { stripe, stripeConfigured } from "@/lib/pay/stripe"
import { fulfillStripeSession } from "@/lib/pay/ledger"

const STATUS: Record<string, { label: string; tone: string }> = {
  CONFIRMED: { label: "Paid", tone: "text-app-good" },
  PENDING: { label: "Waiting for your coach to confirm", tone: "text-app-warn" },
  REJECTED: { label: "Not received", tone: "text-app-muted" },
  REFUNDED: { label: "Refunded", tone: "text-app-muted" },
}

export default async function ClientPayPage({ searchParams }: { searchParams: { paid?: string; session_id?: string } }) {
  const session = (await getServerSession(authOptions))!
  const link = await prisma.clientCoach.findFirst({
    where: { clientId: session.user.id, status: "ACTIVE" },
    select: { coachId: true, coach: { select: { name: true, coachProfile: { select: { venmoHandle: true, payInstructions: true } } } } },
  })

  // They have just come back from paying. Record it now if the webhook has not yet, so it shows straight away.
  let justPaid = false
  if (searchParams.session_id && stripeConfigured()) {
    try {
      const s = await stripe().checkout.sessions.retrieve(searchParams.session_id)
      if (s.metadata?.clientId === session.user.id && s.payment_status === "paid") {
        await fulfillStripeSession(s)
        justPaid = true
      }
    } catch {
      // Not ours, expired, or Stripe is slow: the webhook still records it.
    }
  }

  const [products, payments] = await Promise.all([
    link ? prisma.product.findMany({ where: { coachId: link.coachId, active: true }, orderBy: { sortOrder: "asc" } }) : [],
    prisma.payment.findMany({ where: { clientId: session.user.id }, orderBy: { createdAt: "desc" }, take: 25 }),
  ])
  const coachName = link?.coach.name?.split(" ")[0] ?? "your coach"
  const profile = link?.coach.coachProfile

  return (
    <div className="space-y-5">
      <Link href="/client" className="text-sm font-semibold text-app-muted">
        ‹ Today
      </Link>
      <h1 className="font-display text-4xl font-bold">Pay</h1>

      {justPaid && (
        <p role="status" className="rounded-2xl bg-app-good px-4 py-3 font-semibold text-white">
          Payment received. Thank you!
        </p>
      )}

      <PayOptions
        products={products.map((p) => ({ id: p.id, name: p.name, description: p.description, priceCents: p.priceCents, sessions: p.sessions }))}
        methods={{ card: stripeConfigured(), venmo: profile?.venmoHandle ?? null, instructions: profile?.payInstructions ?? null }}
        coachName={coachName}
      />

      {payments.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-app-muted">Your payments</h2>
          <ul className="divide-y divide-app-border rounded-2xl border border-app-border bg-app-surface">
            {payments.map((p) => {
              const st = STATUS[p.status] ?? STATUS.CONFIRMED
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{p.description}</span>
                    <span className="block text-xs text-app-muted">
                      {p.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} · {METHOD_LABEL[p.method as Method] ?? p.method} ·{" "}
                      <span className={st.tone}>{st.label}</span>
                    </span>
                  </span>
                  <span className="shrink-0 font-display text-lg font-bold">{dollars(p.amountCents)}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
