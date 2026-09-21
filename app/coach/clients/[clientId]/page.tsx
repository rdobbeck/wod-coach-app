import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import DashboardHeader from "@/components/DashboardHeader"
import ClientActions from "@/components/coach/ClientActions"
import AddWorkoutButton from "@/components/coach/AddWorkoutButton"
import DraftProgramBar from "@/components/coach/DraftProgramBar"
import HistoryView from "@/components/client/HistoryView"
import { dayKey, getHistoryOverview } from "@/lib/training"

const WEEKS_BACK = 4
const WEEKS_AHEAD = 4

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: { clientId: string }
  searchParams: { tab?: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") redirect("/")

  const clientCoach = await prisma.clientCoach.findFirst({
    where: { coachId: session.user.id, clientId: params.clientId },
    include: { client: { include: { clientProfile: true } } },
  })
  if (!clientCoach) redirect("/coach/clients")
  const client = clientCoach.client
  const profile = client.clientProfile
  const tab = searchParams.tab === "exercises" || searchParams.tab === "history" ? searchParams.tab : "calendar"

  // Calendar window: Monday WEEKS_BACK weeks ago -> Sunday WEEKS_AHEAD weeks ahead.
  const today = new Date()
  today.setUTCHours(12, 0, 0, 0)
  const monday = new Date(today)
  monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7) - WEEKS_BACK * 7)
  const end = new Date(monday)
  end.setUTCDate(monday.getUTCDate() + (WEEKS_BACK + WEEKS_AHEAD + 1) * 7 - 1)
  const todayKey = dayKey(today)

  const [workouts, overview, programs] = await Promise.all([
    prisma.workout.findMany({
      where: { clientId: client.id, scheduledDate: { gte: monday, lte: end } },
      orderBy: [{ scheduledDate: "asc" }, { order: "asc" }],
      include: { _count: { select: { exercises: true, comments: true } }, logs: { select: { notes: true } }, program: { select: { isDraft: true } } },
    }),
    tab === "calendar" ? null : getHistoryOverview(client.id),
    prisma.program.findMany({ where: { clientId: client.id }, orderBy: { startDate: "desc" }, take: 10 }),
  ])

  const weeks = Array.from({ length: WEEKS_BACK + WEEKS_AHEAD + 1 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = new Date(monday)
      day.setUTCDate(monday.getUTCDate() + w * 7 + d)
      const key = dayKey(day)
      return { key, day, items: workouts.filter((x) => dayKey(x.scheduledDate) === key) }
    })
  )
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", { ...o, timeZone: "UTC" })

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <Link href="/coach/clients" className="text-sm text-primary-600 hover:text-primary-700">← All clients</Link>

        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{client.name || "Unnamed client"}</h1>
              <p className="text-sm text-gray-600">{client.email}</p>
              <p className="mt-1 text-xs text-gray-500">
                {[profile?.units === "kg" ? "kg" : "lb", profile?.goals.length ? `Goals: ${profile.goals.join(", ")}` : null, profile?.injuries ? `Notes: ${profile.injuries}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${clientCoach.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
              {clientCoach.status}
            </span>
          </div>
          <div className="mt-4">
            <ClientActions clientId={client.id} canMoveWorkouts={profile?.canMoveWorkouts ?? true} hasPassword={!!client.hashedPassword} />
          </div>
        </div>

        <div className="mt-5 flex gap-1 rounded-lg bg-gray-200 p-1 text-sm font-semibold sm:w-fit">
          {[
            ["calendar", "Calendar"],
            ["history", "History"],
          ].map(([k, label]) => (
            <Link
              key={k}
              href={`/coach/clients/${client.id}${k === "calendar" ? "" : `?tab=${k}`}`}
              className={`flex-1 rounded-md px-4 py-2 text-center ${(tab === "calendar" ? k === "calendar" : k === "history") ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"}`}
            >
              {label}
            </Link>
          ))}
        </div>

        {tab === "calendar" && (
          <div className="mt-4 space-y-4">
            {programs
              .filter((p) => p.isDraft)
              .map((p) => (
                <DraftProgramBar
                  key={p.id}
                  programId={p.id}
                  name={p.name}
                  range={`${fmt(p.startDate, { month: "short", day: "numeric" })}${p.endDate ? ` – ${fmt(p.endDate, { month: "short", day: "numeric" })}` : ""}`}
                />
              ))}
            {weeks.map((week) => (
              <section key={week[0].key} className="rounded-xl border border-gray-200 bg-white">
                <h2 className="border-b border-gray-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Week of {fmt(week[0].day, { month: "short", day: "numeric" })}
                  {week.some((d) => d.key === todayKey) && <span className="ml-2 text-primary-600">This week</span>}
                </h2>
                <ul className="divide-y divide-gray-100">
                  {week.map((d) => (
                    <li key={d.key} className={`flex gap-3 px-4 py-2 ${d.key === todayKey ? "bg-primary-50/50" : ""}`}>
                      <div className="w-20 shrink-0 text-sm">
                        <span className="font-semibold text-gray-900">{fmt(d.day, { weekday: "short" })}</span>{" "}
                        <span className="text-gray-500">{fmt(d.day, { month: "numeric", day: "numeric" })}</span>
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        {d.items.map((w) => {
                          const rest = w._count.exercises === 0 && /rest/i.test(w.name)
                          const status = w.program?.isDraft ? "Draft" : rest ? "Rest" : w.isCompleted ? "Done" : d.key < todayKey ? "Missed" : "Planned"
                          const color = { Draft: "bg-violet-100 text-violet-800", Rest: "bg-gray-100 text-gray-600", Done: "bg-green-100 text-green-800", Missed: "bg-red-100 text-red-700", Planned: "bg-primary-100 text-primary-800" }[status]
                          return (
                            <Link key={w.id} href={`/coach/clients/${client.id}/workouts/${w.id}`} className="flex items-center gap-2 text-sm hover:underline">
                              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${color}`}>{status}</span>
                              <span className="truncate text-gray-900">{w.name}</span>
                              {w.originalDate && <span className="shrink-0 text-[11px] text-gray-500">moved from {fmt(w.originalDate, { month: "numeric", day: "numeric" })}</span>}
                              {(w.logs[0]?.notes || w._count.comments > 0) && <span className="shrink-0 text-[11px] text-gray-500">💬</span>}
                            </Link>
                          )
                        })}
                      </div>
                      <AddWorkoutButton clientId={client.id} date={d.key} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
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

        {programs.length > 0 && (
          <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Programs</h2>
            <ul className="mt-2 divide-y divide-gray-100 text-sm">
              {programs.map((p) => (
                <li key={p.id} className="flex justify-between gap-3 py-2">
                  <span className="truncate text-gray-800">{p.name}</span>
                  <span className="shrink-0 text-gray-500">
                    {fmt(p.startDate, { month: "short", day: "numeric", year: "numeric" })}
                    {p.endDate && ` – ${fmt(p.endDate, { month: "short", day: "numeric", year: "numeric" })}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
