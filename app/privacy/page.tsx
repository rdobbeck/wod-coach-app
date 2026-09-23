import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Privacy · WOD.COACH",
  description: "What WOD.COACH stores, why, and who it's shared with.",
}

const UPDATED = "September 23, 2026"

const sections: { title: string; body: string[] }[] = [
  {
    title: "Who we are",
    body: [
      "WOD.COACH is a coaching app built and run by Dobbeck Training Systems. Coaches use it to program training for their clients, and clients use it to see and log that training.",
      "Questions or requests about your data: dobbecktraining@gmail.com.",
    ],
  },
  {
    title: "What we store",
    body: [
      "Account details: your name, email address, and a securely hashed password. If you sign in with Google, we receive your name, email address and profile picture from Google. We don't get access to your Gmail, Drive, contacts or anything else in your Google account.",
      "Training data: programs, workouts, the sets, reps, weights, RPE and notes you log, comments and messages between you and your coach, fasting logs if your coach turns that on, and settings like units and theme.",
      "Coach details: your coach link, business name and bio, plus your clients and the programs you build.",
      "Technical data: a session cookie that keeps you signed in, and a push notification subscription if you turn notifications on.",
    ],
  },
  {
    title: "How it's used",
    body: [
      "Only to run the app: showing you your training, showing your coach what you logged, sending notifications you asked for, and keeping your account secure.",
      "We don't sell your data, show ads, or share it with advertisers.",
    ],
  },
  {
    title: "Who can see it",
    body: [
      "Your coach sees the training data you log and the messages you send them. Clients only see their own training. Coaches only see their own clients.",
      "The app runs on service providers that process data on our behalf: Vercel (hosting), Supabase (database), and web push services from your browser maker for notifications. When a coach uses the AI program builder, the coach's inputs for that program are sent to an AI model provider through OpenRouter to draft it. Card payments, where offered, are handled by Stripe; we never see or store full card numbers.",
    ],
  },
  {
    title: "Your choices",
    body: [
      "You can change your name, password, units and notification settings in Settings. You can ask us to export or delete your account and data at any time by emailing dobbecktraining@gmail.com, and we'll do it within 30 days.",
    ],
  },
  {
    title: "Changes",
    body: ["If this policy changes in a meaningful way, we'll update the date below and let active users know in the app."],
  },
]

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#0e0f12] font-sans text-[#f4f1ea]">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link href="/" className="font-display text-2xl font-bold tracking-wide">
          WOD<span className="text-[#c1272d]">.</span>COACH
        </Link>
        <h1 className="mt-10 font-display text-5xl font-bold leading-tight">Privacy</h1>
        <p className="mt-2 text-sm text-[#8c8478]">Last updated {UPDATED}</p>
        <div className="mt-10 space-y-8">
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="font-display text-2xl font-bold">{s.title}</h2>
              {s.body.map((p) => (
                <p key={p.slice(0, 24)} className="mt-3 leading-relaxed text-[#c9c2b7]">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
