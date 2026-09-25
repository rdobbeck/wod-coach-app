import type { Metadata } from "next"
import Link from "next/link"
import { MARKUP } from "@/lib/ai-billing"
import { PAID_PLANS, PLANS, SETUP_CENTS, STARTER_AI_CENTS, TRIAL_DAYS, formatDollars } from "@/lib/plans"

export const metadata: Metadata = {
  title: "Pricing · WOD.COACH",
  description: `Coach plans from ${formatDollars(PLANS.COACH.monthlyCents)} a month. Every feature on every plan, ${TRIAL_DAYS}-day free trial, no card to start.`,
}

const faqs: { q: string; a: string }[] = [
  {
    q: "Do my clients pay anything?",
    a: "No. Clients use the app free. You pay one plan for your coaching business, sized by how many clients you coach.",
  },
  {
    q: "What happens after the trial?",
    a: `You get ${TRIAL_DAYS} days of Pro with no card. After that, pick a plan, or stay on Free with up to ${PLANS.FREE.clients} clients. Nothing is deleted either way.`,
  },
  {
    q: "How does the AI get paid for?",
    a: `Each plan includes AI-built programs every month. Past that, AI comes out of a prepaid balance at what it actually cost plus ${Math.round((MARKUP - 1) * 100)}%, and a program is usually under $1. New coaches start with ${formatDollars(STARTER_AI_CENTS)} of balance. Or paste your own OpenRouter key and pay OpenRouter directly.`,
  },
  {
    q: "I'm not a computer person. Can you set it up for me?",
    a: `Yes. Done-for-you setup is ${formatDollars(SETUP_CENTS)} once, free with any yearly plan. We move your clients over from CoachRx, TrueCoach or a spreadsheet, set up your page, and build your first program with you on a call.`,
  },
  {
    q: "Can I cancel?",
    a: "Anytime, from Settings. You keep the plan until the end of what you paid for, then drop to Free with all your data.",
  },
]

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#0e0f12] font-sans text-[#f4f1ea]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/" className="font-display text-2xl font-bold tracking-wide">
          WOD<span className="text-[#c1272d]">.</span>COACH
        </Link>
        <Link href="/auth/signin" className="text-sm font-semibold text-[#c9c2b7] hover:text-[#f4f1ea]">
          Sign in
        </Link>
      </header>

      <section className="mx-auto max-w-5xl px-6 pb-12 pt-8">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-[#c1272d]">Pricing</p>
        <h1 className="mt-4 max-w-3xl font-display text-5xl font-bold leading-[1.05] sm:text-6xl">Every feature on every plan.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#b7afa3]">
          You pay for how many clients you coach. Start with {TRIAL_DAYS} days of Pro free, no card.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PAID_PLANS.map((id) => {
            const p = PLANS[id]
            const pro = id === "PRO"
            return (
              <div key={id} className={`rounded-2xl border bg-[#15171c] p-6 ${pro ? "border-[#c1272d]" : "border-[#23262c]"}`}>
                <div className="flex items-baseline justify-between">
                  <h2 className="font-display text-3xl font-bold">{p.name}</h2>
                  {pro && <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#e0565b]">Most coaches</span>}
                </div>
                <p className="mt-3">
                  <span className="font-display text-5xl font-bold">{formatDollars(p.monthlyCents)}</span>
                  <span className="text-sm text-[#8c8478]">/mo</span>
                </p>
                <p className="text-sm text-[#8c8478]">or {formatDollars(p.yearlyCents)} a year, 2 months free</p>
                <ul className="mt-5 space-y-2 text-sm text-[#c9c2b7]">
                  <li>Up to {p.clients} clients</li>
                  <li>{p.aiPrograms} AI-built programs a month</li>
                  <li>{p.assistant ? "AI coaching assistant included" : "AI assistant from your balance"}</li>
                  <li>Your own coach link and page</li>
                </ul>
              </div>
            )
          })}
        </div>

        <p className="mt-5 text-sm text-[#8c8478]">
          Free plan: up to {PLANS.FREE.clients} clients, AI from your balance. Done-for-you setup: {formatDollars(SETUP_CENTS)} once, free with a
          yearly plan.
        </p>

        <Link
          href="/auth/signup?role=coach"
          className="mt-8 inline-flex h-14 items-center justify-center rounded-xl bg-[#c1272d] px-8 font-display text-xl font-bold uppercase tracking-[0.06em] text-white"
        >
          Start free trial
        </Link>
      </section>

      <section className="border-t border-[#23262c] bg-[#101216] py-14">
        <div className="mx-auto grid max-w-5xl gap-4 px-6 md:grid-cols-2">
          {faqs.map((f) => (
            <div key={f.q} className="rounded-2xl border border-[#23262c] bg-[#15171c] p-6">
              <h3 className="font-display text-xl font-bold leading-tight">{f.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#b7afa3]">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-10 text-sm text-[#6f6a62] sm:flex-row sm:items-center sm:justify-between">
        <span>WOD.COACH · built by Dobbeck Training Systems</span>
        <span className="flex gap-5">
          <Link href="/privacy" className="hover:text-[#c9c2b7]">
            Privacy
          </Link>
          <Link href="/auth/signin" className="font-semibold text-[#c9c2b7] hover:text-[#f4f1ea]">
            Sign in
          </Link>
        </span>
      </footer>
    </main>
  )
}
