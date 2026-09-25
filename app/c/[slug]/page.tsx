import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { BRAND_DOMAIN } from "@/lib/coach-link"

/** A coach's own page, served at <slug>.wod.coach (see middleware.ts). */
async function getCoach(slug: string) {
  return prisma.coachProfile.findUnique({
    where: { slug },
    select: {
      userId: true,
      brandName: true,
      bio: true,
      specialties: true,
      certifications: true,
      yearsExp: true,
      bookingUrl: true,
      user: { select: { name: true, image: true } },
    },
  })
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const coach = await getCoach(params.slug)
  const name = coach?.brandName || coach?.user.name || "Coach"
  return { title: `${name} · WOD.COACH`, description: `Training with ${name}: your program, demos and logging on your phone.` }
}

export default async function CoachPage({ params }: { params: { slug: string } }) {
  const coach = await getCoach(params.slug)
  if (!coach) notFound()

  // Something for sale means a Book and pay button on the page.
  const sells = (await prisma.product.count({ where: { coachId: coach.userId, active: true } })) > 0
  const name = coach.user.name ?? "your coach"
  // "Coach Ryan" should read "Train with Ryan", not "Train with Coach".
  const first = name.replace(/^coach\s+/i, "").split(" ")[0]
  // Absolute so it works from the coach's subdomain; sign-in lives on the main domain.
  const main = `https://${BRAND_DOMAIN}`

  const credentials = [
    ...coach.certifications,
    ...(coach.yearsExp ? [`${coach.yearsExp} ${coach.yearsExp === 1 ? "year" : "years"} coaching`] : []),
  ]
  const steps = [
    ["Your program, on your phone", `${first} builds your sessions. Every exercise has a demo video, so you know exactly what to do.`],
    ["Log it in seconds", "Your numbers carry over from last time and the rest timer runs itself. Tick sets as you go."],
    [`${first} sees every session`, "What you lifted, how it felt, and your notes, so your next block is built around you."],
  ]
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("")

  return (
    <main className="min-h-screen bg-[#0e0f12] font-sans text-[#f4f1ea]">
      <section className="mx-auto w-full max-w-xl px-6 pt-16">
        <div className="flex items-center gap-4">
          {coach.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coach.user.image} alt={name} className="h-20 w-20 rounded-full object-cover ring-2 ring-[#c1272d]" />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#1c1e24] font-display text-2xl font-bold ring-2 ring-[#c1272d]">
              {initials}
            </span>
          )}
          <div>
            <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-[#c1272d]">{coach.brandName ?? "Coaching"}</p>
            <p className="text-lg font-semibold">{name}</p>
          </div>
        </div>

        <h1 className="mt-8 font-display text-5xl font-bold leading-[1.05] sm:text-6xl">Train with {first}.</h1>
        <p className="mt-5 whitespace-pre-line text-lg leading-relaxed text-[#b7afa3]">
          {coach.bio || `Your program from ${name}, with a demo on every exercise and logging built for the gym floor.`}
        </p>

        {coach.specialties.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {coach.specialties.map((s) => (
              <span key={s} className="rounded-full border border-[#2c2f36] px-3 py-1 text-sm text-[#e6e0d6]">
                {s}
              </span>
            ))}
          </div>
        )}
        {credentials.length > 0 && <p className="mt-4 text-sm text-[#8c8478]">{credentials.join(" · ")}</p>}

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          <Link
            href={`${main}/auth/signin`}
            className="flex h-14 items-center justify-center rounded-xl bg-[#c1272d] font-display text-xl font-semibold uppercase tracking-[0.06em] text-white"
          >
            Sign in
          </Link>
          {sells && (
            <Link
              href={`${main}/pay/${params.slug}`}
              className="flex h-14 items-center justify-center rounded-xl border border-[#3a3d45] font-display text-xl font-semibold uppercase tracking-[0.06em] sm:col-span-2"
            >
              Book and pay
            </Link>
          )}
          {coach.bookingUrl && (
            <a
              href={coach.bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-14 items-center justify-center rounded-xl border border-[#3a3d45] font-display text-xl font-semibold uppercase tracking-[0.06em]"
            >
              Book an intro call
            </a>
          )}
        </div>
        <p className="mt-4 text-sm text-[#8c8478]">Already training with {first}? They&rsquo;ll text you an invite link, no account to create.</p>
      </section>

      <section className="mx-auto w-full max-w-xl px-6 py-16">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-[#8c8478]">How training with {first} works</p>
        <ol className="mt-6 space-y-6">
          {steps.map(([title, body], i) => (
            <li key={title} className="flex gap-4">
              <span className="font-display text-3xl font-bold leading-none text-[#c1272d]">{i + 1}</span>
              <div>
                <p className="font-display text-2xl font-bold leading-tight">{title}</p>
                <p className="mt-1 text-[#b7afa3]">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mx-auto w-full max-w-xl px-6 pb-10 text-sm text-[#6f6a62]">
        <a href={main} className="hover:text-[#c9c2b7]">
          WOD<span className="text-[#c1272d]">.</span>COACH · Coaches, get your own page
        </a>
      </footer>
    </main>
  )
}
