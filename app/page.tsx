import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import Link from "next/link"
import { redirect } from "next/navigation"

const features = [
  {
    title: "Programs with demos",
    body: "Every exercise carries its video, so clients see the movement before they lift. Coaches build blocks by hand or generate one with AI and edit it.",
  },
  {
    title: "Logging that takes seconds",
    body: "Sets pre-filled from last time, tap to tick them off, a rest timer that reads the prescription. Last time's weights and reps sit under every exercise.",
  },
  {
    title: "The coach sees everything",
    body: "A month calendar per client, what they logged against what you prescribed, their notes, and how their top sets are trending.",
  },
]

export default async function Home() {
  const session = await getServerSession(authOptions)

  // Signed-in users go straight to their dashboard (clients open the app on Today).
  if (session) redirect(session.user.role === "COACH" ? "/coach" : "/client")

  return (
    <main className="min-h-screen bg-[#0e0f12] font-sans text-[#f4f1ea]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-display text-2xl font-bold tracking-wide">
          WOD<span className="text-[#c1272d]">.</span>COACH
        </span>
        <Link href="/auth/signin" className="text-sm font-semibold text-[#c9c2b7] hover:text-[#f4f1ea]">
          Sign in
        </Link>
      </header>

      <section className="mx-auto max-w-5xl px-6 pb-20 pt-10 sm:pt-16">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-[#c1272d]">Coaching platform</p>
        <h1 className="mt-4 max-w-3xl font-display text-5xl font-bold leading-[1.05] sm:text-7xl">
          Your training,
          <br />
          from your coach,
          <br />
          on your phone.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#b7afa3]">
          Strength programs with video demos, logging built for the gym floor, and a coach who can see how every session went.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/auth/signin"
            className="flex h-14 items-center justify-center rounded-xl bg-[#c1272d] px-8 font-display text-xl font-bold uppercase tracking-[0.06em] text-white"
          >
            Sign in
          </Link>
          <Link
            href="/auth/signup?role=coach"
            className="flex h-14 items-center justify-center rounded-xl border border-[#3a3d45] px-8 font-display text-xl font-semibold uppercase tracking-[0.06em] text-[#f4f1ea]"
          >
            Create a coach account
          </Link>
        </div>
        <p className="mt-4 text-sm text-[#8c8478]">
          Training with a coach here? They&rsquo;ll text you an invite link, no account to create.
        </p>
      </section>

      <section className="border-t border-[#23262c] bg-[#101216] py-16">
        <div className="mx-auto grid max-w-5xl gap-6 px-6 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-[#23262c] bg-[#15171c] p-6">
              <h2 className="font-display text-2xl font-bold leading-tight">{f.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#b7afa3]">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-10 text-sm text-[#6f6a62] sm:flex-row sm:items-center sm:justify-between">
        <span>WOD.COACH · built by Dobbeck Training Systems</span>
        <Link href="/auth/signin" className="font-semibold text-[#c9c2b7] hover:text-[#f4f1ea]">
          Sign in
        </Link>
      </footer>
    </main>
  )
}
