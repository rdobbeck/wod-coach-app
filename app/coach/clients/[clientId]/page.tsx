import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import DashboardHeader from "@/components/DashboardHeader"
import ClientActions from "@/components/coach/ClientActions"
import AddWorkoutButton from "@/components/coach/AddWorkoutButton"
import DraftProgramBar from "@/components/coach/DraftProgramBar"
import ProgramActions from "@/components/coach/ProgramActions"
import FastingControl from "@/components/coach/FastingControl"
import HistoryView from "@/components/client/HistoryView"
import { dayKey, getClientSnapshot, getHistoryOverview } from "@/lib/training"
import { clockLabel, fastHours, fastingStreak, type FastEntry } from "@/lib/fasting"

const DAY = 86_400_000
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", { ...o, timeZone: "UTC" })
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: { clientId: string }
  searchParams: { tab?: string; m?: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") redirect("/")

  const [clientCoach, roster] = await Promise.all([
    prisma.clientCoach.findFirst({
      where: { coachId: session.user.id, clientId: params.clientId },
      include: { client: { include: { clientProfile: true } } },
    }),
    prisma.clientCoach.findMany({
      where: { coachId: session.user.id },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            hashedPassword: true,
            workouts: { where: { isCompleted: true }, orderBy: { scheduledDate: "desc" }, take: 1, select: { scheduledDate: true } },
            clientPrograms: { where: { isDraft: false, isActive: true }, take: 1, select: { id: true } },
          },
        },
      },
    }),
  ])
  if (!clientCoach) redirect("/coach/clients")
  const client = clientCoach.client
  const profile = client.clientProfile
  const tab = searchParams.tab === "exercises" || searchParams.tab === "history" ? searchParams.tab : "calendar"

  // Month shown in the calendar (?m=YYYY-MM), default the current month.
  const today = new Date()
  today.setUTCHours(12, 0, 0, 0)
  const parsed = searchParams.m?.match(/^(\d{4})-(\d{2})$/)
  const monthStart = new Date(
    Date.UTC(parsed ? Number(parsed[1]) : today.getUTCFullYear(), parsed ? Number(parsed[2]) - 1 : today.getUTCMonth(), 1, 12)
  )
  const gridStart = new Date(monthStart)
  gridStart.setUTCDate(1 - ((monthStart.getUTCDay() + 6) % 7)) // back to Monday
  const gridEnd = new Date(gridStart.getTime() + 41 * DAY)
  const prevMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1, 12))
  const nextMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1, 12))
  const todayKey = dayKey(today)

  const [workouts, overview, programs, snapshot] = await Promise.all([
    prisma.workout.findMany({
      where: { clientId: client.id, scheduledDate: { gte: gridStart, lte: gridEnd } },
      orderBy: [{ scheduledDate: "asc" }, { order: "asc" }],
      include: {
        _count: { select: { exercises: true, comments: true } },
        logs: { select: { notes: true } },
        program: { select: { isDraft: true } },
      },
    }),
    tab === "calendar" ? null : getHistoryOverview(client.id),
    prisma.program.findMany({ where: { clientId: client.id }, orderBy: { startDate: "desc" }, take: 10 }),
    getClientSnapshot(client.id),
  ])

  const fastRows = profile?.fastingEnabled
    ? await prisma.fastLog.findMany({ where: { userId: client.id }, orderBy: { startedAt: "desc" }, take: 14 })
    : []
  const fasts: FastEntry[] = fastRows.map((f) => ({
    id: f.id,
    startedAt: f.startedAt.toISOString(),
    endedAt: f.endedAt?.toISOString() ?? null,
    targetHours: f.targetHours,
  }))
  const openFast = fasts.find((f) => !f.endedAt) ?? null
  const doneFasts = fasts.filter((f) => f.endedAt)
  const avgFast = doneFasts.length ? doneFasts.reduce((n, f) => n + fastHours(f), 0) / doneFasts.length : null

  const weeks = Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = new Date(gridStart.getTime() + (w * 7 + d) * DAY)
      const key = dayKey(day)
      return { key, day, inMonth: day.getUTCMonth() === monthStart.getUTCMonth(), items: workouts.filter((x) => dayKey(x.scheduledDate) === key) }
    })
  )
  const trendWeights = snapshot.trend?.points.map((p) => p.weight) ?? []
  const trendMax = Math.max(...trendWeights, 1)
  const trendFloor = trendWeights.length ? Math.min(...trendWeights) * 0.92 : 0
  const stats: [string, string][] = [
    ["Compliance 90d", snapshot.compliance === null ? "-" : `${snapshot.compliance}%`],
    ["Sessions logged", String(snapshot.completedCount)],
    [
      "Last session",
      snapshot.latestSession
        ? snapshot.latestSession.day === todayKey
          ? "Today"
          : fmt(new Date(`${snapshot.latestSession.day}T12:00:00Z`), { month: "short", day: "numeric" })
        : "-",
    ],
    ["Program week", snapshot.programWeek ? `${snapshot.programWeek.week}${snapshot.programWeek.total ? ` of ${snapshot.programWeek.total}` : ""}` : "-"],
  ]

  return (
    <div className="min-h-screen bg-[#f4f2ed]">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />
      <div className="flex">
        <aside className="hidden w-60 shrink-0 border-r border-[#e0dad0] bg-white lg:block">
          <p className="px-4 pb-2 pt-4 font-display text-xs font-semibold uppercase tracking-[0.14em] text-[#857c70]">
            Clients · {roster.filter((r) => r.status === "ACTIVE").length}
          </p>
          <ul>
            {roster.map((r) => {
              const active = r.clientId === client.id
              const last = r.client.workouts[0]?.scheduledDate
              const status = !r.client.clientPrograms.length
                ? { text: "No program", tone: "text-[#9a6a1c]" }
                : last
                  ? { text: dayKey(last) === todayKey ? "Logged today" : `Last ${fmt(last, { month: "short", day: "numeric" })}`, tone: "text-[#6b6257]" }
                  : { text: r.client.hashedPassword ? "No sessions yet" : "Not signed up", tone: "text-[#6b6257]" }
              return (
                <li key={r.id}>
                  <Link
                    href={`/coach/clients/${r.clientId}`}
                    className={`flex items-center gap-3 px-4 py-2.5 ${active ? "border-l-[3px] border-[#c1272d] bg-[#f1ede5]" : "border-l-[3px] border-transparent hover:bg-[#faf8f4]"}`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#16181d] text-xs font-bold text-[#f4f1ea]">
                      {(r.client.name ?? r.client.email ?? "?")
                        .split(" ")
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[#16181d]">{r.client.name ?? r.client.email}</span>
                      <span className={`block truncate text-xs ${status.tone}`}>{status.text}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
          <Link href="/coach/clients/new" className="mt-2 block px-4 py-3 text-sm font-semibold text-[#c1272d]">
            + Add client
          </Link>
        </aside>

        <div className="min-w-0 flex-1 px-4 py-6 sm:px-6">
          <Link href="/coach/clients" className="text-sm text-[#c1272d] lg:hidden">
            ← All clients
          </Link>

          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-4xl font-bold leading-none text-[#16181d]">{client.name || "Unnamed client"}</h1>
              <p className="mt-1 text-sm text-[#6b6257]">
                {[client.email, profile?.units === "kg" ? "kg" : "lb", profile?.canMoveWorkouts === false ? "can't move workouts" : "can move workouts"]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {(profile?.goals.length || profile?.injuries) && (
                <p className="mt-1 text-xs text-[#6b6257]">
                  {[profile?.goals.length ? `Goals: ${profile.goals.join(", ")}` : null, profile?.injuries ? `Notes: ${profile.injuries}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${clientCoach.status === "ACTIVE" ? "bg-[#e6f2ea] text-[#2f6b45]" : "bg-[#eae6df] text-[#6b6257]"}`}
            >
              {clientCoach.status}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            <ClientActions clientId={client.id} canMoveWorkouts={profile?.canMoveWorkouts ?? true} hasPassword={!!client.hashedPassword} />
            <FastingControl clientId={client.id} enabled={profile?.fastingEnabled ?? false} protocol={profile?.fastingProtocol ?? "16:8"} />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-[#e4dfd5] bg-white px-4 py-3">
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-[#857c70]">{label}</p>
                <p className="font-display text-3xl font-bold leading-tight text-[#16181d]">{value}</p>
              </div>
            ))}
          </div>

          {programs.some((p) => p.isDraft) && (
            <div className="mt-5 space-y-3">
              {programs
                .filter((p) => p.isDraft)
                .map((p) => (
                  <DraftProgramBar
                    key={p.id}
                    programId={p.id}
                    name={p.name}
                    range={`${fmt(p.startDate, { month: "short", day: "numeric" })}${p.endDate ? ` to ${fmt(p.endDate, { month: "short", day: "numeric" })}` : ""}`}
                  />
                ))}
            </div>
          )}

          {programs.length > 0 && (
            <section className="mt-5 rounded-2xl border border-[#e4dfd5] bg-white p-4">
              <h2 className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-[#857c70]">Programs</h2>
              <ul className="mt-2 divide-y divide-[#f0ece4] text-sm">
                {programs.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                    <span className="min-w-0 flex-1 truncate text-[#16181d]">
                      {p.name}
                      {p.isDraft && <span className="ml-2 rounded bg-[#efe6f6] px-1.5 py-0.5 text-[11px] font-semibold text-[#5b3590]">Draft</span>}
                    </span>
                    <span className="shrink-0 text-[#857c70]">
                      {fmt(p.startDate, { month: "short", day: "numeric", year: "numeric" })}
                      {p.endDate && ` to ${fmt(p.endDate, { month: "short", day: "numeric", year: "numeric" })}`}
                    </span>
                    {p.programType !== "COACHRX_IMPORT" && <ProgramActions programId={p.id} name={p.name} isDraft={p.isDraft} />}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-5 flex gap-1 rounded-lg bg-[#e7e2d9] p-1 text-sm font-semibold sm:w-fit">
            {[
              ["calendar", "Calendar"],
              ["history", "History"],
            ].map(([k, label]) => (
              <Link
                key={k}
                href={`/coach/clients/${client.id}${k === "calendar" ? "" : `?tab=${k}`}`}
                className={`flex-1 rounded-md px-4 py-2 text-center ${(tab === "calendar" ? k === "calendar" : k === "history") ? "bg-white text-[#16181d] shadow-sm" : "text-[#6b6257]"}`}
              >
                {label}
              </Link>
            ))}
          </div>

          {tab === "calendar" && (
            <div className="mt-4 flex flex-col gap-4 xl:flex-row">
              <section className="min-w-0 flex-1 rounded-2xl border border-[#e4dfd5] bg-white">
                <div className="flex items-center gap-3 border-b border-[#f0ece4] px-4 py-3">
                  <h2 className="font-display text-2xl font-bold text-[#16181d]">{fmt(monthStart, { month: "long", year: "numeric" })}</h2>
                  {snapshot.programWeek && (
                    <span className="hidden text-sm text-[#6b6257] sm:inline">
                      {snapshot.programWeek.name} · week {snapshot.programWeek.week}
                    </span>
                  )}
                  <span className="flex-1" />
                  <Link href={`/coach/clients/${client.id}?m=${monthKey(prevMonth)}`} aria-label="Previous month" className="rounded-md border border-[#ddd7cc] px-2.5 py-1 text-sm">
                    ‹
                  </Link>
                  <Link href={`/coach/clients/${client.id}`} className="rounded-md border border-[#ddd7cc] px-2.5 py-1 text-sm">
                    Today
                  </Link>
                  <Link href={`/coach/clients/${client.id}?m=${monthKey(nextMonth)}`} aria-label="Next month" className="rounded-md border border-[#ddd7cc] px-2.5 py-1 text-sm">
                    ›
                  </Link>
                </div>
                <div className="grid grid-cols-7 gap-1.5 p-3">
                  {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                    <div key={i} className="text-center text-[11px] font-bold text-[#857c70]">
                      {d}
                    </div>
                  ))}
                  {weeks.flat().map((d) => (
                    <div
                      key={d.key}
                      className={`group min-h-[86px] rounded-lg border p-1.5 ${
                        d.key === todayKey ? "border-2 border-[#c1272d] bg-white" : d.inMonth ? "border-[#e4dfd5] bg-white" : "border-[#efeae1] bg-[#faf8f4]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] ${d.key === todayKey ? "font-bold text-[#c1272d]" : "text-[#a79e91]"}`}>{d.day.getUTCDate()}</span>
                        <AddWorkoutButton clientId={client.id} date={d.key} />
                      </div>
                      <div className="mt-1 space-y-1">
                        {d.items.map((w) => {
                          const rest = w._count.exercises === 0 && /rest/i.test(w.name)
                          const status = w.program?.isDraft ? "draft" : rest ? "rest" : w.isCompleted ? "done" : d.key < todayKey ? "missed" : "planned"
                          const tone = {
                            draft: "bg-[#efe6f6] text-[#5b3590]",
                            rest: "bg-[#f1ede5] text-[#6b6257]",
                            done: "bg-[#e6f2ea] text-[#2f6b45]",
                            missed: "bg-[#fbeceb] text-[#b3211f]",
                            planned: "bg-[#eef2f7] text-[#38506b]",
                          }[status]
                          return (
                            <Link
                              key={w.id}
                              href={`/coach/clients/${client.id}/workouts/${w.id}`}
                              className={`block truncate rounded px-1.5 py-1 text-[11px] font-semibold ${tone}`}
                            >
                              {w.name}
                              {(w.logs[0]?.notes || w._count.comments > 0) && " 💬"}
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="flex w-full shrink-0 flex-col gap-4 xl:w-80">
                {snapshot.latestSession && (
                  <section className="rounded-2xl border border-[#e4dfd5] bg-white p-4">
                    <p className="font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-[#857c70]">Latest session</p>
                    <Link
                      href={`/coach/clients/${client.id}/workouts/${snapshot.latestSession.id}`}
                      className="mt-1 block font-display text-2xl font-bold leading-tight text-[#16181d]"
                    >
                      {snapshot.latestSession.name}
                    </Link>
                    <p className="text-xs text-[#857c70]">
                      {fmt(new Date(`${snapshot.latestSession.day}T12:00:00Z`), { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-[#4a443c]">
                      {snapshot.latestSession.lines.map((l, i) => (
                        <li key={i} className="truncate">
                          <span className="font-semibold text-[#16181d]">{l.name}</span> {l.summary}
                        </li>
                      ))}
                    </ul>
                    {snapshot.latestSession.note && (
                      <p className="mt-3 rounded-lg border border-[#f0e3c4] bg-[#fdf8ec] px-3 py-2 text-sm text-[#6b5a2e]">“{snapshot.latestSession.note}”</p>
                    )}
                  </section>
                )}

                {profile?.fastingEnabled && (
                  <section className="rounded-2xl border border-[#e4dfd5] bg-white p-4">
                    <p className="font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-[#857c70]">
                      Fasting · {profile.fastingProtocol}
                    </p>
                    <p className="mt-1 font-display text-2xl font-bold leading-tight text-[#16181d]">
                      {openFast ? `Fasting ${fastHours(openFast).toFixed(1)}h` : "Not fasting right now"}
                    </p>
                    <p className="text-xs text-[#857c70]">
                      Window {clockLabel(profile.eatingWindowStart)} to {clockLabel(profile.eatingWindowEnd)}
                    </p>
                    <div className="mt-3 flex gap-3 text-sm text-[#4a443c]">
                      <span>
                        <span className="font-display text-xl font-bold text-[#16181d]">{fastingStreak(fasts)}</span> day streak
                      </span>
                      {avgFast !== null && (
                        <span>
                          <span className="font-display text-xl font-bold text-[#16181d]">{avgFast.toFixed(1)}h</span> average
                        </span>
                      )}
                    </div>
                    {doneFasts.length > 0 ? (
                      <ul className="mt-3 space-y-1 text-sm">
                        {doneFasts.slice(0, 7).map((f) => {
                          const hours = fastHours(f)
                          return (
                            <li key={f.id} className="flex justify-between gap-3">
                              <span className="text-[#6b6257]">
                                {new Date(f.endedAt!).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                              </span>
                              <span className={`font-semibold ${hours >= f.targetHours ? "text-[#2f6b45]" : "text-[#6b6257]"}`}>{hours.toFixed(1)}h</span>
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-[#857c70]">No fasts logged yet.</p>
                    )}
                  </section>
                )}

                {snapshot.trend && (
                  <section className="rounded-2xl border border-[#e4dfd5] bg-white p-4">
                    <p className="font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-[#857c70]">Top set trend</p>
                    <div className="mt-2 flex h-24 items-end gap-2">
                      {snapshot.trend.points.map((p, i) => (
                        <div key={p.day + i} className="flex flex-1 flex-col items-center gap-1">
                          <span className="text-[10px] text-[#857c70]">{p.weight}</span>
                          <div
                            className={`w-full rounded-t ${i === snapshot.trend!.points.length - 1 ? "bg-[#c1272d]" : "bg-[#e4dfd5]"}`}
                            style={{ height: `${Math.max(((p.weight - trendFloor) / (trendMax - trendFloor || 1)) * 64 + 8, 8)}px` }}
                          />
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-[#6b6257]">
                      {snapshot.trend.name} · last {snapshot.trend.points.length} sessions ({profile?.units ?? "lb"})
                    </p>
                  </section>
                )}
              </div>
            </div>
          )}

          {tab !== "calendar" && overview && (
            <div className="mt-4 max-w-xl">
              <HistoryView
                title={null}
                clientId={client.id}
                units={profile?.units ?? "lb"}
                workouts={overview.workouts}
                exercises={overview.exercises}
                workoutBase={`/coach/clients/${client.id}/workouts/`}
                initialTab={tab === "exercises" ? "exercises" : "workouts"}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
