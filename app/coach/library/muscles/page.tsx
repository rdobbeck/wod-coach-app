import Link from "next/link"
import { notFound } from "next/navigation"
import { getServerSession } from "next-auth"
import DashboardHeader from "@/components/DashboardHeader"
import MuscleReviewRow from "@/components/coach/MuscleReviewRow"
import { authOptions } from "@/lib/auth"
import { canUseLibraryAi } from "@/lib/library/access"
import { reviewList, type ReviewTab } from "@/lib/muscles/review"
import { usageCounts } from "@/lib/muscles/usage"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const TABS: { id: ReviewTab; label: string }[] = [
  { id: "todo", label: "To review" },
  { id: "reviewed", label: "Reviewed" },
  { id: "untagged", label: "No tags" },
]
// The library has about 4,500 names; a phone can't render them all at once.
const PAGE_SIZE = 50

/**
 * Ryan's queue for the muscles the name rules drafted: one row per exercise name, most used first,
 * so the exercises clients see most are checked first. Owners and LIBRARY_AI_COACH_EMAILS only.
 */
export default async function MuscleReviewPage({ searchParams }: { searchParams: { tab?: string; q?: string; after?: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH" || !canUseLibraryAi(session.user.email)) notFound()
  const tab = TABS.find((t) => t.id === searchParams.tab)?.id ?? "todo"
  const q = (searchParams.q ?? "").trim()
  const after = searchParams.after || null
  const [rows, uses] = await Promise.all([
    prisma.exerciseLibrary.findMany({
      select: { id: true, name: true, videoUrl: true, primaryMuscles: true, secondaryMuscles: true, musclesReviewedAt: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    usageCounts(),
  ])
  const list = reviewList(rows, uses, { tab, q, after, pageSize: PAGE_SIZE })
  // Next carries the last name shown, so names reviewed on this page never push the next ones out of reach.
  const href = (t: ReviewTab, cursor: string | null = null) => {
    const s = new URLSearchParams()
    if (t !== "todo") s.set("tab", t)
    if (q) s.set("q", q)
    if (cursor) s.set("after", cursor)
    const qs = s.toString()
    return qs ? `/coach/library/muscles?${qs}` : "/coach/library/muscles"
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link href="/coach/library" className="text-sm font-medium text-primary-600 hover:underline">
          ‹ Exercise Library
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">Review muscles</h1>
        <p data-testid="review-progress" className="mt-1 text-gray-600">
          Reviewed {list.reviewedOfTop} of the {list.topN} most-used.
        </p>

        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Filter">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={href(t.id)}
              aria-current={t.id === tab ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${t.id === tab ? "bg-primary-600 text-white" : "bg-white text-gray-700 shadow"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <form method="get" className="mt-4 flex gap-2">
          {tab !== "todo" && <input type="hidden" name="tab" value={tab} />}
          <input type="search" name="q" defaultValue={q} placeholder="Search name…" className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-base" />
          <button type="submit" className="rounded bg-primary-600 px-4 py-2 text-sm font-semibold text-white">
            Search
          </button>
        </form>

        <p className="mt-4 text-sm text-gray-500">
          {list.total.toLocaleString()} {list.total === 1 ? "exercise" : "exercises"}
        </p>
        {list.rows.length ? (
          <ul className="mt-2 space-y-3">
            {list.rows.map((r) => (
              <MuscleReviewRow key={r.id} row={r} />
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-gray-600">Nothing here.</p>
        )}

        {(after || list.next) && (
          <div className="mt-6 flex items-center justify-between text-sm">
            {after ? <Link href={href(tab)} className="font-semibold text-primary-600">‹ Back to the top</Link> : <span />}
            {list.next ? <Link href={href(tab, list.next)} className="font-semibold text-primary-600">Next {PAGE_SIZE} ›</Link> : <span />}
          </div>
        )}
      </div>
    </div>
  )
}
