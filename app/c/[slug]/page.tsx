import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { BRAND_DOMAIN } from "@/lib/coach-link"

/** A coach's own page, served at <slug>.wod.coach (see middleware.ts). */
async function getCoach(slug: string) {
  return prisma.coachProfile.findUnique({
    where: { slug },
    select: { brandName: true, bio: true, user: { select: { name: true } } },
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

  const name = coach.user.name ?? "your coach"
  const first = name.split(" ")[0]
  // Absolute so it works from the coach's subdomain; sign-in lives on the main domain.
  const main = `https://${BRAND_DOMAIN}`

  return (
    <main className="flex min-h-screen flex-col bg-[#0e0f12] font-sans text-[#f4f1ea]">
      <section className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-16">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-[#c1272d]">
          {coach.brandName ?? "Coaching"}
        </p>
        <h1 className="mt-4 font-display text-5xl font-bold leading-[1.05] sm:text-6xl">
          Train with {first}.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-[#b7afa3]">
          {coach.bio || `Your program from ${name}, with a demo on every exercise and logging built for the gym floor.`}
        </p>
        <Link
          href={`${main}/auth/signin`}
          className="mt-10 flex h-14 items-center justify-center rounded-xl bg-[#c1272d] font-display text-xl font-semibold uppercase tracking-[0.06em] text-white"
        >
          Sign in
        </Link>
        <p className="mt-4 text-sm text-[#8c8478]">
          New here? {first} will text you an invite link, no account to create.
        </p>
      </section>
      <footer className="mx-auto w-full max-w-xl px-6 pb-10 text-sm text-[#6f6a62]">
        <a href={main} className="hover:text-[#c9c2b7]">
          WOD<span className="text-[#c1272d]">.</span>COACH · Coaches, get your own page
        </a>
      </footer>
    </main>
  )
}
