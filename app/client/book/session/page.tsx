import Link from "next/link"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { bookingFor, smsHref } from "@/lib/booking"
import { requireClient } from "@/lib/require-client"

export const dynamic = "force-dynamic"

/**
 * Client books an in-person session: picks where to train, then a time on
 * that place's scheduling page, or texts the coach to set one up.
 */
export default async function BookSession({ searchParams }: { searchParams: { at?: string } }) {
  const session = await requireClient()
  const link = await prisma.clientCoach.findFirst({
    where: { clientId: session.user.id, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: {
      coachId: true,
      coach: {
        select: {
          name: true,
          email: true,
          coachProfile: { select: { textNumber: true } },
          sessionLocations: { orderBy: { sortOrder: "asc" }, select: { id: true, label: true, url: true } },
        },
      },
    },
  })
  const places = link?.coach.sessionLocations ?? []
  const coachName = link?.coach.name ?? link?.coach.email ?? "your coach"
  const firstName = coachName.split(" ")[0]
  const text = smsHref(link?.coach.coachProfile?.textNumber, `Hi ${firstName}, I'd like to set up a session.`)
  if (!places.length && !text) redirect("/client")

  const chosen = places.find((p) => p.id === searchParams.at) ?? null
  const booking = chosen ? bookingFor(chosen.url) : null

  return (
    <div className="space-y-4">
      <header>
        <Link href="/client" className="text-sm text-app-muted">
          &larr; Today
        </Link>
        <h1 className="mt-1 font-display text-4xl font-bold leading-none">Book a session</h1>
        <p className="mt-1 text-sm text-app-muted">
          {chosen ? `Pick a time at ${chosen.label}.` : `Where do you want to train with ${firstName}?`}
        </p>
      </header>

      {places.length > 0 && (
        <nav aria-label="Where to train" className={chosen ? "flex flex-wrap gap-2" : "space-y-3"}>
          {places.map((p) =>
            chosen ? (
              <Link
                key={p.id}
                href={`/client/book/session?at=${p.id}`}
                aria-current={p.id === chosen.id ? "page" : undefined}
                className={`rounded-full border px-4 py-2 text-sm font-semibold ${p.id === chosen.id ? "border-app-accent text-app-text" : "border-app-border text-app-muted"}`}
              >
                {p.label}
              </Link>
            ) : (
              <Link
                key={p.id}
                href={`/client/book/session?at=${p.id}`}
                data-testid="place"
                className="flex items-center gap-3 rounded-2xl border border-app-border bg-app-surface px-4 py-4"
              >
                <span className="min-w-0 flex-1 font-display text-2xl font-bold leading-tight">{p.label}</span>
                <span className="shrink-0 text-app-muted" aria-hidden="true">
                  &rarr;
                </span>
              </Link>
            )
          )}
        </nav>
      )}

      {booking?.embedUrl ? (
        <div className="overflow-hidden rounded-2xl border border-app-border bg-white">
          <iframe
            src={booking.embedUrl}
            title={`Book a session at ${chosen!.label}`}
            className="h-[70vh] w-full"
            style={{ minHeight: 520 }}
            allow="camera; microphone; fullscreen; payment"
          />
        </div>
      ) : booking ? (
        <p className="rounded-2xl border border-dashed border-app-border p-5 text-sm text-app-muted">
          Booking opens on {firstName}&rsquo;s scheduling page.
        </p>
      ) : null}

      {booking && (
        <a
          href={booking.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-12 items-center justify-center rounded-xl border border-app-border text-sm font-semibold text-app-text"
        >
          Open the full booking page
        </a>
      )}

      {text && (
        <a
          href={text}
          className={`flex h-12 items-center justify-center rounded-xl text-sm font-semibold ${chosen ? "border border-app-border text-app-text" : "bg-app-accent text-white"}`}
        >
          Text {firstName} to set up a time
        </a>
      )}
    </div>
  )
}
