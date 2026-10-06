import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { signDownloads } from "@/lib/uploads"
import DashboardHeader from "@/components/DashboardHeader"
import ResolveBugButton from "@/components/coach/ResolveBugButton"

export const dynamic = "force-dynamic"

const card = "rounded-2xl border border-[#e4dfd5] bg-white p-5"
const label = "font-display text-xs font-semibold uppercase tracking-[0.14em] text-[#857c70]"

/** iPhone / Android / Mac etc. from a user agent, for a glance. Everything else stays in the hover. */
function device(ua: string | null) {
  if (!ua) return "Unknown device"
  if (/iPhone/.test(ua)) return "iPhone"
  if (/iPad/.test(ua)) return "iPad"
  if (/Android/.test(ua)) return "Android"
  if (/Macintosh/.test(ua)) return "Mac"
  if (/Windows/.test(ua)) return "Windows"
  return "Other"
}

const when = (d: Date) =>
  d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })

/** Problems clients reported, open ones first, screenshots inline. */
export default async function BugsPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") redirect("/")
  const coachId = session.user.id

  const reports = await prisma.bugReport.findMany({
    where: { user: { coaches: { some: { coachId } } } },
    orderBy: [{ resolvedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    take: 100,
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  const urls = await signDownloads(reports.flatMap((r) => r.screenshots))
  const open = reports.filter((r) => !r.resolvedAt)
  const done = reports.filter((r) => r.resolvedAt)

  const Report = ({ r }: { r: (typeof reports)[number] }) => (
    <article className={card} data-testid="bug-report">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold">
            <Link href={`/coach/clients/${r.user.id}`} className="hover:underline">
              {r.user.name ?? r.user.email ?? "Client"}
            </Link>
          </p>
          <p className="text-xs text-[#857c70]">
            {when(r.createdAt)}
            {r.path ? ` · on ${r.path}` : ""}
            {" · "}
            <span title={r.userAgent ?? undefined}>{device(r.userAgent)}</span>
            {r.installed ? " · Home Screen app" : " · browser"}
            {r.viewport ? ` · ${r.viewport}` : ""}
          </p>
        </div>
        <ResolveBugButton id={r.id} resolved={!!r.resolvedAt} />
      </div>
      {r.body && <p className="mt-3 whitespace-pre-wrap text-sm text-[#2a2c31]">{r.body}</p>}
      {r.screenshots.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {r.screenshots.map((p) =>
            urls[p] ? (
              <a key={p} href={urls[p]} target="_blank" rel="noreferrer">
                <img src={urls[p]} alt="Screenshot" className="h-56 rounded-lg border border-[#e4dfd5] object-contain" />
              </a>
            ) : (
              <span key={p} className="text-xs text-[#857c70]">
                (screenshot unavailable)
              </span>
            )
          )}
        </div>
      )}
    </article>
  )

  return (
    <div className="min-h-screen bg-[#f4f1ea]">
      <DashboardHeader userName={session.user.name ?? "Coach"} role="COACH" />
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <h1 className="font-display text-3xl font-bold">Reported problems</h1>
          <p className="mt-1 text-sm text-[#857c70]">
            What clients flagged from Settings → Report a problem. Open ones also ping your phone each morning until you resolve them.
          </p>
        </div>

        <section className="space-y-3">
          <p className={label}>Open ({open.length})</p>
          {open.length ? open.map((r) => <Report key={r.id} r={r} />) : <p className="text-sm text-[#857c70]">Nothing open. Nice.</p>}
        </section>

        {done.length > 0 && (
          <section className="space-y-3">
            <p className={label}>Resolved ({done.length})</p>
            {done.map((r) => (
              <Report key={r.id} r={r} />
            ))}
          </section>
        )}
      </main>
    </div>
  )
}
