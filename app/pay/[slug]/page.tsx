import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import GuestBuy from "@/components/pay/GuestBuy"
import { stripeConfigured } from "@/lib/pay/stripe"

const getCoach = (slug: string) =>
  prisma.coachProfile.findUnique({ where: { slug }, select: { userId: true, brandName: true, user: { select: { name: true } } } })

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const c = await getCoach(params.slug)
  const name = c?.brandName || c?.user.name || "Coach"
  return { title: `Book and pay · ${name}`, description: `Buy a session or a package with ${name}.` }
}

/** The public place to buy a session or package from a coach. No account needed. */
export default async function PayPage({ params }: { params: { slug: string } }) {
  const coach = await getCoach(params.slug)
  if (!coach) notFound()
  const name = coach.brandName || coach.user.name || "your coach"
  const first = (coach.user.name ?? "your coach").replace(/^coach\s+/i, "").split(" ")[0]
  const products = await prisma.product.findMany({ where: { coachId: coach.userId, active: true }, orderBy: { sortOrder: "asc" } })

  return (
    <main className="min-h-screen bg-[#0e0f12] font-sans text-[#f4f1ea]">
      <section className="mx-auto w-full max-w-xl px-6 py-14">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-[#8c8478]">{name}</p>
        <h1 className="mt-1 font-display text-5xl font-bold leading-none">Train with {first}</h1>
        <p className="mt-3 text-[#8c8478]">Pick a session or a package. You will get a receipt by email, and {first} will be in touch to set up your first session.</p>
        <GuestBuy
          slug={params.slug}
          items={products.map((p) => ({ id: p.id, name: p.name, description: p.description, priceCents: p.priceCents }))}
          cardReady={stripeConfigured()}
          coachFirst={first}
        />
      </section>
    </main>
  )
}
