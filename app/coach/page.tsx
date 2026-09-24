import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { clientVisible, dayKey, fromDayKey } from "@/lib/training"
import { BRAND_DOMAIN, brandDomainLive, coachLinkUrl, coachLinkHost } from "@/lib/coach-link"
import DashboardHeader from "@/components/DashboardHeader"
import CopyLinkButton from "@/components/coach/CopyLinkButton"

/**
 * Coach home: what needs you today, not totals. Everything here is computed
 * from the coach's active clients over a small window (last 7 days, next 14).
 */

// Calendar "today" for the coach. Workouts are stored as calendar days (noon
// UTC), so the only timezone question is which day it is right now.
const TZ = process.env.COACH_TZ || "America/Chicago"
const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date())
const addDays = (key: string, n: number) => dayKey(new Date(fromDayKey(key).getTime() + n * 86_400_000))
const shortDay = (key: string) =>
  fromDayKey(key).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
const ago = (d: Date) => {
  const h = Math.round((Date.now() - d.getTime()) / 3_600_000)
  if (h < 1) return "just now"
  if (h < 24) return `${h}h ago`
  const days = Math.round(h / 24)
  return days === 1 ? "yesterday" : `${days} days ago`
}
const firstName = (n: string | null) => (n ?? "Client").split(" ")[0]

const card = "rounded-2xl border border-[#e4dfd5] bg-white"
const label = "font-display text-xs font-semibold uppercase tracking-[0.14em] text-[#857c70]"

type Attention = { key: string; tone: "red" | "amber" | "ink"; title: string; detail: string; href: string; cta: string }

export default async function CoachDashboard() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") redirect("/")
  const coachId = session.user.id

  const [links, profile] = await Promise.all([
    prisma.clientCoach.findMany({
      where: { coachId, status: "ACTIVE" },
      select: { client: { select: { id: true, name: true } } },
    }),
    prisma.coachProfile.findUnique({ where: { userId: coachId }, select: { slug: true } }),
  ])
  const clients = links.map((l) => l.client)
  const ids = clients.map((c) => c.id)
  const nameOf = new Map(clients.map((c) => [c.id, c.name ?? "Client"]))

  const today = todayKey()
  const weekAgo = addDays(today, -7)
  const horizon = addDays(today, 14)

  const [workouts, lastLogs, recent, unread, drafts, comments] = await Promise.all([
    prisma.workout.findMany({
      where: { clientId: { in: ids }, scheduledDate: { gte: fromDayKey(weekAgo), lte: fromDayKey(horizon) }, ...clientVisible },
      select: { id: true, clientId: true, name: true, scheduledDate: true, isCompleted: true, program: { select: { name: true } } },
      orderBy: { scheduledDate: "asc" },
    }),
    prisma.workoutLog.groupBy({ by: ["userId"], where: { userId: { in: ids }, workout: { isCompleted: true } }, _max: { completedAt: true } }),
    prisma.workoutLog.findMany({
      where: { userId: { in: ids }, workout: { isCompleted: true } },
      orderBy: { completedAt: "desc" },
      take: 8,
      select: { completedAt: true, userId: true, workout: { select: { id: true, name: true } } },
    }),
    prisma.message.groupBy({ by: ["senderId"], where: { receiverId: coachId, isRead: false }, _count: true }),
    prisma.program.findMany({ where: { coachId, isDraft: true }, select: { id: true, name: true, clientId: true } }),
    prisma.workoutComment.findMany({
      where: { authorId: { in: ids }, createdAt: { gte: new Date(Date.now() - 3 * 86_400_000) } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, body: true, authorId: true, createdAt: true, workout: { select: { id: true, name: true } } },
    }),
  ])

  // ---- first-run setup: ticks itself off from real data, gone once done ---
  const [programCount, joinedCount] = await Promise.all([
    prisma.program.count({ where: { coachId, isDraft: false } }),
    ids.length ? prisma.user.count({ where: { id: { in: ids }, OR: [{ hashedPassword: { not: null } }, { accounts: { some: {} } }] } }) : 0,
  ])
  const setup = [
    { done: !!profile?.slug, title: "Pick your link", detail: `Clients sign in from your own page, yourname.${BRAND_DOMAIN}.`, href: "/coach/settings", cta: "Pick it" },
    { done: ids.length > 0, title: "Add your first client", detail: "A name and an email. Nothing is sent to them yet.", href: "/coach/clients/new", cta: "Add client" },
    { done: programCount > 0, title: "Build their first program", detail: "Draft a block with AI and edit it, or build it by hand.", href: "/coach/programs/ai-builder", cta: "Build" },
    {
      done: joinedCount > 0,
      title: "Send them their sign-in link",
      detail: "Open the client, tap New sign-in link, and text it to them. They set a password and they're in.",
      href: ids.length ? `/coach/clients/${ids[0]}` : "/coach/clients",
      cta: "Open client",
    },
  ]
  const setupLeft = setup.filter((s) => !s.done).length

  // ---- per-client rollups -------------------------------------------------
  const byClient = new Map<string, typeof workouts>()
  for (const w of workouts) byClient.set(w.clientId!, [...(byClient.get(w.clientId!) ?? []), w])
  const lastTrained = new Map(lastLogs.map((l) => [l.userId, l._max.completedAt]))

  const monday = (() => {
    const d = fromDayKey(today)
    return addDays(today, -((d.getUTCDay() + 6) % 7))
  })()

  const roster = clients
    .map((c) => {
      const ws = byClient.get(c.id) ?? []
      const missed = ws.filter((w) => dayKey(w.scheduledDate) < today && !w.isCompleted)
      const next = ws.find((w) => dayKey(w.scheduledDate) >= today && !w.isCompleted)
      const thisWeek = ws.filter((w) => dayKey(w.scheduledDate) >= monday && dayKey(w.scheduledDate) < addDays(monday, 7))
      return {
        id: c.id,
        name: c.name ?? "Client",
        missed,
        next,
        weekDone: thisWeek.filter((w) => w.isCompleted).length,
        weekTotal: thisWeek.length,
        last: lastTrained.get(c.id) ?? null,
        runsOut: !ws.some((w) => dayKey(w.scheduledDate) >= today),
      }
    })
    .sort((a, b) => (b.last?.getTime() ?? 0) - (a.last?.getTime() ?? 0))

  const todays = workouts.filter((w) => dayKey(w.scheduledDate) === today)
  const doneToday = todays.filter((w) => w.isCompleted).length
  const missedWeek = roster.reduce((n, r) => n + r.missed.length, 0)
  const unreadTotal = unread.reduce((n, u) => n + u._count, 0)

  // ---- what needs the coach, most urgent first ----------------------------
  const attention: Attention[] = [
    ...drafts.map((p) => ({
      key: `draft-${p.id}`,
      tone: "ink" as const,
      title: `${p.name} is waiting for you`,
      detail: `AI draft for ${nameOf.get(p.clientId) ?? "a client"}. Review and publish it.`,
      href: `/coach/clients/${p.clientId}`,
      cta: "Review",
    })),
    ...unread
      .filter((u) => nameOf.has(u.senderId))
      .map((u) => ({
        key: `msg-${u.senderId}`,
        tone: "red" as const,
        title: `${nameOf.get(u.senderId)} messaged you`,
        detail: `${u._count} unread`,
        href: `/coach/clients/${u.senderId}/messages`,
        cta: "Reply",
      })),
    ...comments
      .filter((c) => c.authorId)
      .map((c) => ({
        key: `c-${c.id}`,
        tone: "red" as const,
        title: `${nameOf.get(c.authorId!)} commented on ${c.workout.name}`,
        detail: `"${c.body.slice(0, 90)}${c.body.length > 90 ? "…" : ""}" · ${ago(c.createdAt)}`,
        href: `/coach/clients/${c.authorId}/workouts/${c.workout.id}`,
        cta: "Open",
      })),
    ...roster
      .filter((r) => r.missed.length >= 2)
      .map((r) => ({
        key: `miss-${r.id}`,
        tone: "amber" as const,
        title: `${r.name} missed ${r.missed.length} sessions this week`,
        detail: `Last trained ${r.last ? ago(r.last) : "not yet"}. Worth a check-in.`,
        href: `/coach/clients/${r.id}/messages`,
        cta: "Message",
      })),
    ...roster
      .filter((r) => r.runsOut)
      .map((r) => ({
        key: `out-${r.id}`,
        tone: "amber" as const,
        title: `${r.name} has nothing scheduled`,
        detail: "No sessions in the next two weeks. Time for a new block.",
        href: `/coach/programs/ai-builder`,
        cta: "Build",
      })),
  ]
  const tones = { red: "bg-[#c1272d]", amber: "bg-[#c98a2b]", ink: "bg-[#16181d]" }

  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(new Date()))
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
  const live = brandDomainLive() && profile?.slug

  return (
    <div className="min-h-screen bg-[#f4f2ed]">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-[#6b6257]">{shortDay(today)}</p>
            <h1 className="font-display text-4xl font-bold text-[#16181d]">
              {greeting}, {firstName(session.user.name ?? null)}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {live && (
              <span className="flex items-center gap-2 rounded-xl border border-[#e4dfd5] bg-white px-3 py-2 text-sm">
                <a href={coachLinkUrl(profile!.slug!)} target="_blank" rel="noreferrer" className="font-semibold text-[#c1272d]">
                  {coachLinkHost(profile!.slug!)}
                </a>
                <CopyLinkButton url={coachLinkUrl(profile!.slug!)} />
              </span>
            )}
            <Link href="/coach/clients/new" className="rounded-xl border border-[#ddd7cc] bg-white px-4 py-2 text-sm font-semibold text-[#16181d]">
              Add client
            </Link>
            <Link href="/coach/programs/ai-builder" className="rounded-xl bg-[#16181d] px-4 py-2 text-sm font-semibold text-[#f4f1ea]">
              Build a program
            </Link>
          </div>
        </header>

        {setupLeft > 0 && (
          <section className={`${card} mt-6 p-5`}>
            <div className="flex items-baseline justify-between gap-3">
              <p className={label}>{ids.length ? "Finish setting up" : "Welcome. Four steps to your first client training"}</p>
              <p className="text-sm text-[#6b6257]">
                {setup.length - setupLeft} of {setup.length} done
              </p>
            </div>
            <ol className="mt-3 divide-y divide-[#efeae1]">
              {setup.map((s, i) => (
                <li key={s.title} className="flex items-center gap-3 py-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      s.done ? "bg-[#2f7d4f] text-white" : "border border-[#ddd7cc] text-[#857c70]"
                    }`}
                  >
                    {s.done ? "✓" : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold ${s.done ? "text-[#857c70] line-through" : "text-[#16181d]"}`}>{s.title}</p>
                    {!s.done && <p className="text-sm text-[#6b6257]">{s.detail}</p>}
                  </div>
                  {!s.done && (
                    <Link href={s.href} className="shrink-0 rounded-lg bg-[#16181d] px-3 py-1.5 text-sm font-semibold text-[#f4f1ea]">
                      {s.cta}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {ids.length > 0 && (
        <>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Active clients", String(clients.length), null],
            ["Done today", todays.length ? `${doneToday}/${todays.length}` : "0", todays.length ? "sessions" : "nothing scheduled"],
            ["Missed this week", String(missedWeek), missedWeek ? "sessions" : "all caught up"],
            ["Unread", String(unreadTotal), unreadTotal ? "messages" : "inbox clear"],
          ].map(([k, v, sub]) => (
            <div key={k} className={`${card} p-4`}>
              <p className={label}>{k}</p>
              <p className="mt-1 font-display text-3xl font-bold text-[#16181d]">{v}</p>
              {sub && <p className="text-xs text-[#857c70]">{sub}</p>}
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
          <div className="min-w-0 space-y-6">
            <section className={`${card} p-5`}>
              <p className={label}>Needs you</p>
              {attention.length ? (
                <ul className="mt-3 divide-y divide-[#efeae1]">
                  {attention.slice(0, 8).map((a) => (
                    <li key={a.key} className="flex items-center gap-3 py-3">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tones[a.tone]}`} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-snug text-[#16181d]">{a.title}</p>
                        <p className="line-clamp-2 text-sm text-[#6b6257]">{a.detail}</p>
                      </div>
                      <Link href={a.href} className="shrink-0 rounded-lg border border-[#ddd7cc] px-3 py-1.5 text-sm font-semibold text-[#16181d]">
                        {a.cta}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-[#6b6257]">Nothing waiting on you. Everyone&rsquo;s on plan.</p>
              )}
            </section>

            <section className={`${card} p-5`}>
              <div className="flex items-baseline justify-between">
                <p className={label}>Today&rsquo;s sessions</p>
                <p className="text-sm text-[#6b6257]">{todays.length ? `${doneToday} of ${todays.length} done` : ""}</p>
              </div>
              {todays.length ? (
                <ul className="mt-3 divide-y divide-[#efeae1]">
                  {todays.map((w) => (
                    <li key={w.id}>
                      <Link href={`/coach/clients/${w.clientId}`} className="flex items-center gap-3 py-3">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            w.isCompleted ? "bg-[#2f7d4f] text-white" : "border border-[#ddd7cc] text-[#857c70]"
                          }`}
                        >
                          {w.isCompleted ? "✓" : ""}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-[#16181d]">{nameOf.get(w.clientId!)}</span>
                          <span className="block truncate text-sm text-[#6b6257]">
                            {w.name}
                            {w.program ? ` · ${w.program.name}` : ""}
                          </span>
                        </span>
                        <span className={`text-sm font-semibold ${w.isCompleted ? "text-[#2f7d4f]" : "text-[#857c70]"}`}>
                          {w.isCompleted ? "Done" : "Not yet"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-[#6b6257]">No one&rsquo;s scheduled today.</p>
              )}
            </section>

            <section className={`${card} overflow-hidden`}>
              <div className="flex items-baseline justify-between p-5 pb-3">
                <p className={label}>Clients</p>
                <Link href="/coach/clients" className="text-sm font-semibold text-[#c1272d]">
                  All clients
                </Link>
              </div>
              {roster.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-y border-[#efeae1] text-left text-xs uppercase tracking-[0.08em] text-[#857c70]">
                        <th className="px-5 py-2 font-semibold">Client</th>
                        <th className="px-3 py-2 font-semibold">Last trained</th>
                        <th className="px-3 py-2 font-semibold">Next</th>
                        <th className="px-5 py-2 text-right font-semibold">This week</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#efeae1]">
                      {roster.map((r) => (
                        <tr key={r.id} className="hover:bg-[#faf8f4]">
                          <td className="px-5 py-3">
                            <Link href={`/coach/clients/${r.id}`} className="font-semibold text-[#16181d]">
                              {r.name}
                            </Link>
                          </td>
                          <td className="px-3 py-3 text-[#6b6257]">{r.last ? ago(r.last) : "not yet"}</td>
                          <td className="px-3 py-3 text-[#6b6257]">
                            {r.next ? (
                              <>
                                {shortDay(dayKey(r.next.scheduledDate))} <span className="text-[#857c70]">· {r.next.name}</span>
                              </>
                            ) : (
                              <span className="font-semibold text-[#c98a2b]">nothing scheduled</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right font-semibold text-[#16181d]">
                            {r.weekTotal ? `${r.weekDone}/${r.weekTotal}` : "–"}
                            {r.missed.length > 0 && <span className="ml-2 text-xs font-semibold text-[#c98a2b]">{r.missed.length} missed</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-5 pb-5 text-sm text-[#6b6257]">
                  No clients yet.{" "}
                  <Link href="/coach/clients/new" className="font-semibold text-[#c1272d]">
                    Add your first client
                  </Link>
                  .
                </div>
              )}
            </section>
          </div>

          <aside className="min-w-0 space-y-6">
            <section className={`${card} p-5`}>
              <p className={label}>Recent activity</p>
              {recent.length ? (
                <ul className="mt-3 space-y-3">
                  {recent.map((l) => (
                    <li key={`${l.userId}-${l.workout.id}`}>
                      <Link href={`/coach/clients/${l.userId}`} className="block">
                        <p className="text-sm text-[#16181d]">
                          <span className="font-semibold">{firstName(nameOf.get(l.userId) ?? null)}</span> finished {l.workout.name}
                        </p>
                        <p className="text-xs text-[#857c70]">{ago(l.completedAt)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-[#6b6257]">Finished sessions show up here.</p>
              )}
            </section>

            <section className={`${card} p-5`}>
              <p className={label}>Shortcuts</p>
              <div className="mt-3 grid gap-2">
                {[
                  ["/coach/library", "Exercise library"],
                  ["/coach/programs", "Programs"],
                  ["/coach/settings", "Settings"],
                  ["/coach/help", "Help"],
                ].map(([href, text]) => (
                  <Link key={href} href={href} className="rounded-xl border border-[#e4dfd5] px-4 py-2.5 text-sm font-semibold text-[#16181d] hover:bg-[#faf8f4]">
                    {text}
                  </Link>
                ))}
              </div>
            </section>
          </aside>
        </div>
        </>
        )}
      </div>
    </div>
  )
}
