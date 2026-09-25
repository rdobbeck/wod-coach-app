import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import AISettingsForm from "@/components/ai/AISettingsForm"
import DashboardHeader from "@/components/DashboardHeader"
import { hint, isSealed, seal } from "@/lib/secret-box"
import { MARKUP, programFundingSummary } from "@/lib/ai-billing"
import { formatDollars, getCoachPlan } from "@/lib/plans"

const card = "rounded-2xl border border-[#e4dfd5] bg-white p-5"
const label = "font-display text-xs font-semibold uppercase tracking-[0.14em] text-[#857c70]"

export default async function AISettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") redirect("/")

  const coach = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, openrouterApiKey: true, preferredModel: true, aiBalanceCents: true },
  })
  if (!coach) redirect("/coach")

  // Seal a key saved before encryption existed; this runs on the server, so it
  // uses the production secret.
  if (coach.openrouterApiKey && !isSealed(coach.openrouterApiKey)) {
    await prisma.coachProfile.update({ where: { id: coach.id }, data: { openrouterApiKey: seal(coach.openrouterApiKey) } })
  }

  const [{ plan }, funding] = await Promise.all([getCoachPlan(session.user.id), programFundingSummary(session.user.id)])
  const markupPct = Math.round((MARKUP - 1) * 100)

  return (
    <div className="min-h-screen bg-[#f4f2ed]">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link href="/coach/settings" className="text-sm font-semibold text-[#6b6257]">
          ‹ Settings
        </Link>
        <h1 className="mt-2 font-display text-4xl font-bold text-[#16181d]">AI</h1>

        <section className={`${card} mt-6`}>
          <p className={label}>How your AI is paid for</p>
          <ol className="mt-3 space-y-2 text-sm text-[#4a443c]">
            <li>
              <strong>1. Your own key, if you save one below.</strong> OpenRouter bills you directly and nothing comes out of your plan or balance.
            </li>
            <li>
              <strong>2. Your plan.</strong> {plan.name} includes {plan.aiPrograms} AI-built programs a month
              {plan.assistant ? " and the AI assistant" : ""}.
            </li>
            <li>
              <strong>3. Your AI balance.</strong> Past that, you pay what the AI actually cost plus {markupPct}%. A program is usually under $1.
              Balance: <strong>{formatDollars(coach.aiBalanceCents)}</strong>.{" "}
              <Link href="/coach/settings/billing" className="font-semibold underline">
                Add balance
              </Link>
            </li>
          </ol>
          <p className="mt-3 text-sm font-semibold text-[#16181d]">
            Right now:{" "}
            {funding.mode === "byok"
              ? "your own key"
              : funding.mode === "allowance"
                ? `your plan (${funding.left} programs left this month)`
                : funding.mode === "balance"
                  ? "your AI balance"
                  : "nothing left this month. Add balance or save a key."}
          </p>
        </section>

        <AISettingsForm keyHint={hint(coach.openrouterApiKey)} preferredModel={coach.preferredModel} />
      </div>
    </div>
  )
}
