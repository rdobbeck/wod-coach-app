import { prisma } from "@/lib/prisma"
import { dollars } from "@/lib/pay/money"
import { stripe, stripeConfigured } from "@/lib/pay/stripe"
import { fulfillStripeSession } from "@/lib/pay/ledger"

/**
 * Where Stripe sends someone after they pay from the public page. It records the
 * payment if the webhook has not yet. It shows only what they bought, and never a
 * sign-in link: the coach sends the invite once they know who this is.
 */
export default async function ThanksPage({ params, searchParams }: { params: { slug: string }; searchParams: { session_id?: string } }) {
  const coach = await prisma.coachProfile.findUnique({ where: { slug: params.slug }, select: { userId: true, user: { select: { name: true } } } })
  const first = (coach?.user.name ?? "your coach").replace(/^coach\s+/i, "").split(" ")[0]

  let paid: { what: string; amount: number } | null = null
  if (coach && searchParams.session_id && stripeConfigured()) {
    try {
      const s = await stripe().checkout.sessions.retrieve(searchParams.session_id)
      if (s.metadata?.coachId === coach.userId && s.payment_status === "paid") {
        await fulfillStripeSession(s)
        paid = { what: s.metadata?.description ?? "your session", amount: s.amount_total ?? 0 }
      }
    } catch {
      // The payment is safe either way; the webhook records it.
    }
  }

  return (
    <main className="min-h-screen bg-[#0e0f12] font-sans text-[#f4f1ea]">
      <section className="mx-auto w-full max-w-xl px-6 py-16">
        <h1 className="font-display text-5xl font-bold leading-none">{paid ? "Thank you" : "Payment on its way"}</h1>
        <p className="mt-4 text-lg">
          {paid ? `${dollars(paid.amount)} for ${paid.what} is paid.` : "If you have just paid, it will show up in a moment."} A receipt is on its way to your email.
        </p>
        <p className="mt-3 text-[#8c8478]">{first} will reach out to set up your first session and send you a link to get into the app.</p>
      </section>
    </main>
  )
}
