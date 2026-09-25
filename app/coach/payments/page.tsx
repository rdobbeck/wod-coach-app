import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import DashboardHeader from "@/components/DashboardHeader"
import { Ledger, PendingList, PricesEditor, RecordForm } from "@/components/coach/PaymentsBoard"
import { dollars } from "@/lib/pay/money"
import { stripeConfigured } from "@/lib/pay/stripe"

export default async function PaymentsPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") redirect("/")
  const coachId = session.user.id

  const [links, products, payments, profile] = await Promise.all([
    prisma.clientCoach.findMany({ where: { coachId }, orderBy: { createdAt: "asc" }, select: { status: true, client: { select: { id: true, name: true, email: true } } } }),
    prisma.product.findMany({ where: { coachId }, orderBy: { sortOrder: "asc" } }),
    prisma.payment.findMany({ where: { coachId }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.coachProfile.findUnique({ where: { userId: coachId }, select: { venmoHandle: true, payInstructions: true } }),
  ])

  const name = new Map(links.map((l) => [l.client.id, l.client.name ?? l.client.email ?? "Client"]))
  const label = (p: (typeof payments)[number]) => (p.clientId && name.get(p.clientId)) || p.payerName || p.payerEmail || "Someone"
  const pending = payments.filter((p) => p.status === "PENDING")
  const ledger = payments.filter((p) => p.status === "CONFIRMED" || p.status === "REFUNDED")

  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
  const thisMonth = ledger.filter((p) => p.status === "CONFIRMED" && p.createdAt >= monthStart).reduce((n, p) => n + p.amountCents, 0)
  const thisYear = new Date().getUTCFullYear()

  return (
    <div className="min-h-screen bg-[#f4f2ed]">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-4xl font-bold leading-none text-[#16181d]">Payments</h1>
            <p className="mt-1 text-sm text-[#6b6257]">{dollars(thisMonth)} received this month.</p>
          </div>
          <a href={`/api/payments/export?year=${thisYear}`} className="rounded-lg border border-[#ddd7cc] bg-white px-4 py-2 text-sm font-semibold text-[#16181d]">
            Export {thisYear} (CSV)
          </a>
        </div>

        {pending.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-display text-xl font-bold text-[#16181d]">To confirm</h2>
            <PendingList rows={pending.map((p) => ({ id: p.id, client: label(p), description: p.description, amountCents: p.amountCents, method: p.method, createdAt: p.createdAt.toISOString() }))} />
          </section>
        )}

        <section className="space-y-2">
          <h2 className="font-display text-xl font-bold text-[#16181d]">Record a payment</h2>
          <RecordForm clients={links.filter((l) => l.client.id !== coachId).map((l) => ({ id: l.client.id, name: l.client.name ?? l.client.email ?? "Client" }))} />
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl font-bold text-[#16181d]">Everything received</h2>
          <Ledger rows={ledger.map((p) => ({ id: p.id, client: label(p), description: p.description, amountCents: p.amountCents, method: p.method, status: p.status, createdAt: p.createdAt.toISOString() }))} />
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl font-bold text-[#16181d]">Prices and ways to pay</h2>
          <PricesEditor
            products={products.map((p) => ({ id: p.id, name: p.name, description: p.description, priceCents: p.priceCents, sessions: p.sessions, active: p.active }))}
            venmo={profile?.venmoHandle ?? ""}
            instructions={profile?.payInstructions ?? ""}
            cardReady={stripeConfigured()}
          />
        </section>
      </main>
    </div>
  )
}
