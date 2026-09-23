import Link from "next/link"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { bookingFor } from "@/lib/booking"
import { callCreditsFor, creditsLabel } from "@/lib/call-credits"

export const dynamic = "force-dynamic"

/** Client picks a time for a video call with their coach, without leaving the app. */
export default async function BookCall() {
  const session = (await getServerSession(authOptions))!
  const link = await prisma.clientCoach.findFirst({
    where: { clientId: session.user.id, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: {
      coachId: true,
      coach: { select: { name: true, email: true, coachProfile: { select: { bookingUrl: true } } } },
    },
  })
  const booking = bookingFor(link?.coach.coachProfile?.bookingUrl)
  if (!booking) redirect("/client")

  const coachName = link!.coach.name ?? link!.coach.email ?? "your coach"
  const credits = await callCreditsFor(session.user.id, link!.coachId)
  const spent = !credits.unlimited && credits.left <= 0

  return (
    <div className="space-y-4">
      <header>
        <Link href="/client" className="text-sm text-app-muted">
          &larr; Today
        </Link>
        <h1 className="mt-1 font-display text-4xl font-bold leading-none">Book a call</h1>
        <p className="mt-1 text-sm text-app-muted">Pick a time with {coachName}.</p>
      </header>

      <section className="rounded-2xl border border-app-border bg-app-surface p-4">
        <div className="flex items-center gap-3">
          {!credits.unlimited && (
            <span className="flex gap-1.5" aria-hidden="true">
              {Array.from({ length: credits.allowance }, (_, i) => (
                <span
                  key={i}
                  className={`h-3 w-3 rounded-full ${i < credits.left ? "bg-app-accent" : "border border-app-border bg-app-surface2"}`}
                />
              ))}
            </span>
          )}
          <p className="text-sm font-semibold">{creditsLabel(credits)}</p>
        </div>
        {spent && (
          <p className="mt-2 text-sm text-app-muted">
            You can still book, and {coachName} will let you know if anything extra is chargeable.
          </p>
        )}
      </section>

      {booking.embedUrl ? (
        <div className="overflow-hidden rounded-2xl border border-app-border bg-white">
          <iframe
            src={booking.embedUrl}
            title={`Book a call with ${coachName}`}
            className="h-[70vh] w-full"
            style={{ minHeight: 520 }}
            allow="camera; microphone; fullscreen; payment"
          />
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-app-border p-5 text-sm text-app-muted">
          Booking opens on your coach&rsquo;s scheduling page.
        </p>
      )}

      <a
        href={booking.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-12 items-center justify-center rounded-xl border border-app-border text-sm font-semibold text-app-text"
      >
        Open the full booking page
      </a>
    </div>
  )
}
