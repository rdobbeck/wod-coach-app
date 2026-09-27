import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { authOptions } from "@/lib/auth"
import DashboardHeader from "@/components/DashboardHeader"
import { MARKUP } from "@/lib/ai-billing"
import { PLANS, SETUP_CENTS, STARTER_AI_CENTS, TRIAL_DAYS, formatDollars } from "@/lib/plans"

const card = "rounded-2xl border border-[#e4dfd5] bg-white p-5"
const label = "font-display text-xs font-semibold uppercase tracking-[0.14em] text-[#857c70]"
const linkCls = "text-sm font-semibold text-[#c1272d] hover:underline"

// The first week, in the order a new coach does it. Each step links to where it happens.
const steps: { title: string; body: string; href: string; cta: string }[] = [
  {
    title: "Set up your page",
    body: "Add a photo, a few sentences about who you coach, and your specialties. This is what a new client sees at your link before they sign in.",
    href: "/coach/settings",
    cta: "Open Settings",
  },
  {
    title: "Add a client",
    body: "Name, email, goals, equipment and any injuries. Nothing is sent to them yet.",
    href: "/coach/clients/new",
    cta: "Add a client",
  },
  {
    title: "Build their program",
    body: "Answer four questions and AI drafts a periodized block, or add sessions by hand on their calendar with + Add. Either way it stays a draft until you publish it.",
    href: "/coach/programs/ai-builder",
    cta: "Build a program",
  },
  {
    title: "Review and publish",
    body: "Open the client, check the sessions on their calendar, edit anything, then tap Publish to client. Drag a session to another day to move it.",
    href: "/coach/clients",
    cta: "Open Clients",
  },
  {
    title: "Invite them",
    body: "On the client's page, tap Invite to app. The link is copied; text it to them. They tap it, they're in, and today's session is waiting.",
    href: "/coach/clients",
    cta: "Open Clients",
  },
]

const faqs: { q: string; a: string }[] = [
  {
    q: "What does my client need to do?",
    a: "Tap the link you text them. On a phone, they should add the app to their Home Screen (Share, then Add to Home Screen on iPhone) and turn on notifications in Settings, so they hear when a program lands or you reply.",
  },
  {
    q: "How do clients log a session?",
    a: "They open today's session on Today. Sets are pre-filled from last time, they tick each one off, and a rest timer starts from your prescription. Their notes and numbers show up on your calendar for that client.",
  },
  {
    q: "Can clients move their own workouts?",
    a: "If you allow it. Set the default for new clients in Settings, or switch it per client on their page. They hold a session and drag it to another day.",
  },
  {
    q: "How does the AI get paid for?",
    a: `First, your own OpenRouter key if you've saved one. Then your plan's AI programs for the month. After that, your AI balance, at what the AI actually cost plus ${Math.round((MARKUP - 1) * 100)}%. A program is usually under $1, and you see the price before anything runs. New coaches start with ${formatDollars(STARTER_AI_CENTS)} of balance.`,
  },
  {
    q: "What's the AI assistant?",
    a: "On a client's page, tap Ask AI and describe a change in plain words, like \"no overhead work for two weeks\" or \"he's travelling with dumbbells only\". It proposes edits to their calendar and nothing changes until you apply them. Every change can be undone.",
  },
  {
    q: "How do clients pay me?",
    a: "Set your prices, Venmo handle and payment details on Payments. Clients see them on their Pay screen. Record cash or a Venmo you've seen arrive, and export the year as a CSV for your taxes. Card payments to your own Stripe account are coming.",
  },
  {
    q: "A client stopped training with me. What now?",
    a: "On Clients, tap Move to past. They stop counting toward your plan's limit, and all their history stays. Make current brings them back.",
  },
  {
    q: "What happens when my trial ends?",
    a: `You're on Pro free for ${TRIAL_DAYS} days, no card needed. After that, pick a plan in Plan & billing, or stay on Free with up to ${PLANS.FREE.clients} current clients. Nothing is deleted either way.`,
  },
  {
    q: "Can someone set this up for me?",
    a: `Yes. Done-for-you setup is ${formatDollars(SETUP_CENTS)} once, and free with any yearly plan. We move your clients over from CoachRx, TrueCoach or a spreadsheet, set up your page, and build your first program with you on a call.`,
  },
]

export default async function HelpPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") redirect("/")

  return (
    <div className="min-h-screen bg-[#f4f2ed]">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="font-display text-4xl font-bold text-[#16181d]">Help</h1>
        <p className="mt-1 text-sm text-[#6b6257]">From signing up to your first client logging a session. Most coaches are done in an evening.</p>

        <section className="mt-6">
          <p className={label}>Your first week</p>
          <ol className="mt-3 space-y-3">
            {steps.map((s, i) => (
              <li key={s.title} className={`${card} flex gap-4`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#16181d] font-display text-lg font-bold text-[#f4f1ea]">
                  {i + 1}
                </span>
                <div>
                  <h2 className="font-display text-xl font-bold text-[#16181d]">{s.title}</h2>
                  <p className="mt-1 text-sm text-[#4a443c]">{s.body}</p>
                  <Link href={s.href} className={`mt-2 inline-block ${linkCls}`}>
                    {s.cta} ›
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={`${card} mt-8`}>
          <p className={label}>Getting a good AI program</p>
          <ul className="mt-3 space-y-2 text-sm text-[#4a443c]">
            <li>
              <strong>Be specific about the goal.</strong> &ldquo;Add 20 kg to her squat in 12 weeks&rdquo; beats &ldquo;get stronger&rdquo;.
            </li>
            <li>
              <strong>List injuries and limits.</strong> The program works around them.
            </li>
            <li>
              <strong>Pick the real equipment.</strong> If they train at home with dumbbells, say so.
            </li>
            <li>
              <strong>Always review before you publish.</strong> The draft is a starting point. Swap exercises, change loads, and add your own notes.
            </li>
          </ul>
        </section>

        <section className="mt-8">
          <p className={label}>Questions coaches ask</p>
          <div className="mt-3 space-y-2">
            {faqs.map((f) => (
              <details key={f.q} className={`${card} group`}>
                <summary className="cursor-pointer list-none font-semibold text-[#16181d] marker:hidden">
                  <span className="flex items-center justify-between gap-3">
                    {f.q}
                    <span className="text-[#857c70] transition-transform group-open:rotate-90">›</span>
                  </span>
                </summary>
                <p className="mt-2 text-sm text-[#4a443c]">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={`${card} mt-8`}>
          <p className={label}>Still stuck?</p>
          <p className="mt-2 text-sm text-[#4a443c]">
            Email <span className="font-semibold text-[#16181d]">dobbecktraining@gmail.com</span> and you&rsquo;ll hear back within a day. Or{" "}
            <Link href="/coach/settings/billing" className={linkCls}>
              book done-for-you setup
            </Link>{" "}
            and we&rsquo;ll do it together.
          </p>
        </section>
      </div>
    </div>
  )
}
