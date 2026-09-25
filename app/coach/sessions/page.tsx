import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import DashboardHeader from "@/components/DashboardHeader"
import { ClientTable, RefreshButton, ReviewList, type ClientRow, type ReviewRow } from "@/components/coach/SessionsAudit"
import { computeCounter } from "@/lib/sessions/counter"
import { feedConfigured } from "@/lib/sessions/sync"

export default async function SessionsPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") redirect("/")
  const coachId = session.user.id
  const now = new Date()

  const [links, events, state, review] = await Promise.all([
    prisma.clientCoach.findMany({
      where: { coachId },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      select: { status: true, client: { select: { id: true, name: true, email: true } } },
    }),
    prisma.sessionEvent.findMany({
      where: { coachId, clientIds: { isEmpty: false }, startsAt: { gte: new Date(now.getTime() - 200 * 86_400_000) } },
      select: { clientIds: true, startsAt: true, endsAt: true, packageIndex: true, packageSize: true, needsPayment: true, paidOverride: true },
    }),
    prisma.sessionSyncState.findUnique({ where: { coachId } }),
    prisma.sessionEvent.findMany({
      // matchedBy is null for a session nobody matched, and SQL never says "null is not ignored", so both cases are spelled out.
      where: { coachId, clientIds: { isEmpty: true }, OR: [{ matchedBy: null }, { matchedBy: { not: "ignored" } }], startsAt: { gte: new Date(now.getTime() - 60 * 86_400_000) } },
      orderBy: { startsAt: "desc" },
      take: 40,
      select: { id: true, title: true, startsAt: true },
    }),
  ])

  const clients = links.filter((l) => l.client.id !== coachId)
  const byClient = new Map<string, typeof events>()
  for (const e of events) for (const id of e.clientIds) byClient.set(id, [...(byClient.get(id) ?? []), e])

  const rows: ClientRow[] = clients
    .map((l) => {
      const mine = byClient.get(l.client.id) ?? []
      const c = computeCounter(mine, now)
      return {
        id: l.client.id,
        name: l.client.name ?? l.client.email ?? "Client",
        used: c.used,
        size: c.size,
        left: c.left,
        packageDone: c.packageDone,
        estimated: c.estimated,
        next: c.next?.startsAt.toISOString() ?? null,
        paymentDue: c.paymentDue,
        onCalendar: mine.length > 0,
        active: l.status === "ACTIVE",
      }
    })
    // Who needs you first: payment due, then packages nearly used up, then the rest.
    .sort((a, b) => Number(b.active) - Number(a.active) || Number(b.paymentDue) - Number(a.paymentDue) || (a.left ?? 99) - (b.left ?? 99) || a.name.localeCompare(b.name))

  const reviewRows: ReviewRow[] = review.map((r) => ({ id: r.id, title: r.title, startsAt: r.startsAt.toISOString(), suggestion: "" }))
  const configured = feedConfigured()
  const report = state?.lastReport as { recurringSkipped?: number } | null

  return (
    <div className="min-h-screen bg-[#f4f2ed]">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-4xl font-bold leading-none text-[#16181d]">Sessions</h1>
            <p className="mt-1 text-sm text-[#6b6257]">
              Read from your calendar. {state?.lastSyncAt ? `Last read ${state.lastSyncAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.` : "Not read yet."}
            </p>
          </div>
          {configured && <RefreshButton />}
        </div>

        {!configured && (
          <section className="rounded-2xl border border-[#f0e3c4] bg-[#fdf8ec] p-5 text-sm text-[#6b5a2e]">
            <p className="font-semibold">Connect your calendar</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>In Google Calendar, open the settings for your business calendar, then <b>Integrate calendar</b>.</li>
              <li>Copy the <b>Secret address in iCal format</b>. Anyone with it can read the calendar, so treat it like a password.</li>
              <li>
                Add it to the app: <code className="rounded bg-white px-1.5 py-0.5">vercel env add GCAL_ICS_URL production</code>, then redeploy.
              </li>
            </ol>
          </section>
        )}
        {state?.lastError && <p className="rounded-xl bg-[#fbeceb] px-4 py-3 text-sm text-[#a3262b]">The last read failed: {state.lastError}</p>}
        {report?.recurringSkipped ? (
          <p className="text-xs text-[#857c70]">
            {report.recurringSkipped} repeating calendar events were skipped. Sessions that repeat on a schedule are not counted yet.
          </p>
        ) : null}

        <ClientTable rows={rows} />

        {reviewRows.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-display text-xl font-bold text-[#16181d]">Needs your eye</h2>
            <p className="text-sm text-[#6b6257]">These look like sessions but none of your clients matched. Say who they are for and it is remembered.</p>
            <ReviewList rows={reviewRows} clients={clients.map((l) => ({ id: l.client.id, name: l.client.name ?? l.client.email ?? "Client" }))} />
          </section>
        )}
      </main>
    </div>
  )
}
