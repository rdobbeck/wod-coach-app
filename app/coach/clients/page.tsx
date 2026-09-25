import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import DashboardHeader from "@/components/DashboardHeader"
import EmptyState from "@/components/coach/EmptyState"
import ClientStatusButton from "@/components/coach/ClientStatusButton"
import { getCoachPlan } from "@/lib/plans"

export default async function AllClientsPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") redirect("/")

  const links = await prisma.clientCoach.findMany({
    where: { coachId: session.user.id },
    select: {
      id: true,
      clientId: true,
      status: true,
      startDate: true,
      client: { select: { name: true, email: true, hashedPassword: true, _count: { select: { accounts: true } } } },
    },
    orderBy: { createdAt: "desc" },
  })
  const { plan } = await getCoachPlan(session.user.id)
  const current = links.filter((l) => l.status !== "INACTIVE")
  const past = links.filter((l) => l.status === "INACTIVE")

  const row = (l: (typeof links)[number]) => {
    const joined = !!l.client.hashedPassword || l.client._count.accounts > 0
    return (
      <li key={l.id}>
        <Link href={`/coach/clients/${l.clientId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-[#faf8f4]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#16181d] font-display text-sm font-bold text-[#f4f1ea]">
            {(l.client.name ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-[#16181d]">{l.client.name ?? "Unnamed client"}</span>
            <span className="block truncate text-sm text-[#6b6257]">{l.client.email}</span>
          </span>
          {l.status === "PAUSED" && <span className="rounded-full bg-[#f3ead8] px-2.5 py-0.5 text-xs font-semibold text-[#8a5a14]">Paused</span>}
          <span className={`hidden shrink-0 text-xs font-semibold sm:inline ${joined ? "text-[#2f7d4f]" : "text-[#c98a2b]"}`}>
            {joined ? "Signed in" : "Not invited yet"}
          </span>
          <ClientStatusButton clientId={l.clientId} current={l.status !== "INACTIVE"} name={(l.client.name ?? "Client").split(" ")[0]} />
        </Link>
      </li>
    )
  }

  return (
    <div className="min-h-screen bg-[#f4f2ed]">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-bold text-[#16181d]">Clients</h1>
            <p className="mt-1 text-sm text-[#6b6257]">
              {current.filter((l) => l.status === "ACTIVE").length} of {plan.clients} current on {plan.name}
              {past.length ? ` · ${past.length} past` : ""}
            </p>
          </div>
          <Link href="/coach/clients/new" className="rounded-xl bg-[#16181d] px-4 py-2 text-sm font-semibold text-[#f4f1ea]">
            Add client
          </Link>
        </div>

        <div className="mt-6 space-y-6">
          {links.length === 0 ? (
            <EmptyState
              title="Add your first client"
              body="Just a name and an email. Nothing goes to them until you're ready: build their program, then text them a sign-in link from their page. No app to download."
              href="/coach/clients/new"
              cta="Add client"
            />
          ) : (
            <>
              <section className="overflow-hidden rounded-2xl border border-[#e4dfd5] bg-white">
                {current.length ? (
                  <ul className="divide-y divide-[#efeae1]">{current.map(row)}</ul>
                ) : (
                  <p className="px-5 py-4 text-sm text-[#6b6257]">No current clients. Past clients are below.</p>
                )}
              </section>
              {past.length > 0 && (
                <section>
                  <p className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-[#857c70]">
                    Past clients · their history is kept
                  </p>
                  <div className="overflow-hidden rounded-2xl border border-[#e4dfd5] bg-white opacity-80">
                    <ul className="divide-y divide-[#efeae1]">{past.map(row)}</ul>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
