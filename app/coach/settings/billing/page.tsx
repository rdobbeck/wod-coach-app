import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import DashboardHeader from "@/components/DashboardHeader"
import { BuyButton, ManageBillingButton, PlanPicker } from "@/components/coach/BillingActions"
import { PAID_PLANS, PLANS, activeClientCount, formatDollars, getCoachPlan } from "@/lib/plans"
import { billingConfigured, stripeTestMode } from "@/lib/stripe-platform"

const card = "rounded-2xl border border-[#e4dfd5] bg-white p-5"
const label = "font-display text-xs font-semibold uppercase tracking-[0.14em] text-[#857c70]"
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

export default async function BillingPage({ searchParams }: { searchParams: { done?: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") redirect("/")

  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
  const [cp, clients, profile, aiPrograms] = await Promise.all([
    getCoachPlan(session.user.id),
    activeClientCount(session.user.id),
    prisma.coachProfile.findUnique({
      where: { userId: session.user.id },
      select: { aiBalanceCents: true, aiProvider: true, subscription: { select: { setupPaid: true } } },
    }),
    prisma.program.count({ where: { coachId: session.user.id, programType: "AI_GENERATED", createdAt: { gte: monthStart } } }),
  ])
  const { plan } = cp
  const setupPaid = profile?.subscription?.setupPaid ?? false
  const byok = profile?.aiProvider === "BRING_YOUR_OWN_KEY"

  const status =
    cp.source === "owner"
      ? "Owner account, no charge"
      : cp.source === "trial"
        ? `Free trial of Pro · ${cp.trialDaysLeft} ${cp.trialDaysLeft === 1 ? "day" : "days"} left`
        : cp.source === "paid"
          ? cp.status === "past_due"
            ? "Payment failed. Update your card in Manage billing."
            : cp.cancelAtPeriodEnd && cp.currentPeriodEnd
              ? `Cancels ${fmtDate(cp.currentPeriodEnd)}, then Free`
              : `${cp.interval === "year" ? "Yearly" : "Monthly"}${cp.currentPeriodEnd ? ` · renews ${fmtDate(cp.currentPeriodEnd)}` : ""}`
          : "Free plan"

  return (
    <div className="min-h-screen bg-[#f4f2ed]">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/coach/settings" className="text-sm font-semibold text-[#6b6257]">
            ‹ Settings
          </Link>
          {stripeTestMode() && (
            <span className="rounded-full bg-[#fdf1d8] px-2.5 py-0.5 text-xs font-bold uppercase tracking-[0.08em] text-[#8a5a14]">
              Test mode, no real charges
            </span>
          )}
        </div>
        <h1 className="mt-2 font-display text-4xl font-bold text-[#16181d]">Plan &amp; billing</h1>

        {searchParams.done && (
          <p className="mt-4 rounded-xl border border-[#b9dcc5] bg-[#e3f1e8] px-4 py-3 text-sm text-[#2f7d4f]">
            {searchParams.done === "plan"
              ? "You're subscribed. Thanks for backing WOD.COACH. It can take a few seconds to show here."
              : searchParams.done === "ai"
                ? "AI balance topped up. It can take a few seconds to show here."
                : "Done-for-you setup booked. Ryan will reach out to schedule it."}
          </p>
        )}

        <section className={`${card} mt-6`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className={label}>Your plan</p>
              <p className="mt-1 font-display text-3xl font-bold text-[#16181d]">{plan.name}</p>
              <p className={`text-sm ${cp.status === "past_due" ? "font-semibold text-[#c1272d]" : "text-[#6b6257]"}`}>{status}</p>
            </div>
            {cp.source === "paid" && <ManageBillingButton />}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-[#faf8f4] p-3">
              <p className={label}>Clients</p>
              <p className="mt-1 font-display text-2xl font-bold text-[#16181d]">
                {clients} <span className="text-base text-[#857c70]">of {plan.clients}</span>
              </p>
            </div>
            <div className="rounded-xl bg-[#faf8f4] p-3">
              <p className={label}>AI programs this month</p>
              <p className="mt-1 font-display text-2xl font-bold text-[#16181d]">
                {aiPrograms} <span className="text-base text-[#857c70]">of {plan.aiPrograms} included</span>
              </p>
            </div>
            <div className="rounded-xl bg-[#faf8f4] p-3">
              <p className={label}>AI balance</p>
              <p className="mt-1 font-display text-2xl font-bold text-[#16181d]">{byok ? "Your key" : formatDollars(profile?.aiBalanceCents ?? 0)}</p>
            </div>
          </div>
        </section>

        {!billingConfigured() ? (
          <p className="mt-6 text-sm text-[#6b6257]">Paid plans are coming shortly.</p>
        ) : (
          <>
            {cp.source !== "paid" && cp.source !== "owner" && (
              <section className="mt-8">
                <p className={label}>{cp.source === "trial" ? "Keep going after your trial" : "Upgrade"}</p>
                <p className="mb-4 mt-1 text-sm text-[#6b6257]">
                  Every plan has every feature. You only pay for how many clients you coach. Cancel anytime; you drop to Free and keep all your data.
                </p>
                <PlanPicker plans={PAID_PLANS.map((id) => PLANS[id])} currentId={cp.source === "trial" ? "" : plan.id} setupPaid={setupPaid} />
              </section>
            )}

            <section className={`${card} mt-6`}>
              <p className={label}>AI</p>
              <p className="mt-2 text-sm text-[#4a443c]">
                Your plan includes {plan.aiPrograms} AI-built programs a month. Past that, AI comes out of your balance at cost plus 30%, and you see
                the price before anything runs. Or use your own OpenRouter key and pay OpenRouter directly.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {!byok &&
                  [1000, 2500, 5000].map((c) => <BuyButton key={c} body={{ kind: "ai", amountCents: c }} label={`Add ${formatDollars(c)}`} />)}
                <Link href="/coach/settings/ai" className="rounded-xl px-4 py-2 text-sm font-semibold text-[#6b6257] underline">
                  {byok ? "Change AI settings" : "Use my own key instead"}
                </Link>
              </div>
            </section>

            {!setupPaid && cp.source !== "owner" && (
              <section className={`${card} mt-6`}>
                <p className={label}>Done-for-you setup · $199 one-time</p>
                <p className="mt-2 text-sm text-[#4a443c]">
                  Not a computer person? We move your clients over from CoachRx, TrueCoach or a spreadsheet, set up your page, and build your first
                  program with you on a call. Free with any yearly plan.
                </p>
                <div className="mt-4">
                  <BuyButton body={{ kind: "setup" }} label="Book done-for-you setup" />
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
