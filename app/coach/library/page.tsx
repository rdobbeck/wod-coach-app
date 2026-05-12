import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import DashboardHeader from "@/components/DashboardHeader"
import type { Prisma } from "@prisma/client"

// CoachRx's coach-creatable pattern vocabulary, plus the admin-only ones
// that show up on stock entries.
const PATTERN_OPTIONS = [
  "Push",
  "Pull",
  "Squat",
  "Bend",
  "Lunge",
  "Core",
  "Cyclical",
  "Mobility",
  "Stretch",
  "Gymnastics",
  "Plyometric",
  "Weightlifting",
  "Carry",
  "Run",
]

const PAGE_SIZE = 48

// Strip a YouTube watch / short / shorts URL down to its video id. Returns
// null for non-YouTube urls (e.g. Vimeo) so the caller can render a fallback.
function youTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  // youtu.be/<id> and youtube.com/{watch?v=,shorts/,embed/}<id>
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/watch\?[^#]*v=([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

type SearchParams = {
  q?: string
  pattern?: string
  equipment?: string
  source?: "stock" | "custom" | "all"
  page?: string
}

function parsePage(raw: string | undefined): number {
  if (!raw) return 1
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") {
    redirect("/")
  }

  const q = (searchParams.q ?? "").trim()
  const pattern = (searchParams.pattern ?? "").trim()
  const equipment = (searchParams.equipment ?? "").trim()
  const source = searchParams.source === "stock" || searchParams.source === "custom"
    ? searchParams.source
    : "all"
  const page = parsePage(searchParams.page)

  const where: Prisma.ExerciseLibraryWhereInput = {
    coachrxId: { not: null },
  }
  if (q) {
    where.name = { contains: q, mode: "insensitive" }
  }
  if (pattern) {
    where.muscleGroups = { has: pattern }
  }
  if (equipment) {
    where.equipment = { has: equipment }
  }
  if (source === "stock") where.isCustom = false
  if (source === "custom") where.isCustom = true

  const [total, rows, equipmentRows] = await Promise.all([
    prisma.exerciseLibrary.count({ where }),
    prisma.exerciseLibrary.findMany({
      where,
      orderBy: { name: "asc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: {
        id: true,
        name: true,
        videoUrl: true,
        muscleGroups: true,
        equipment: true,
        isCustom: true,
        locked: true,
      },
    }),
    // Build the equipment dropdown from what's actually in the data.
    prisma.exerciseLibrary.findMany({
      where: { coachrxId: { not: null } },
      select: { equipment: true },
      distinct: ["equipment"],
    }),
  ])

  const equipmentOptions = Array.from(
    new Set(equipmentRows.flatMap((r) => r.equipment))
  )
    .filter(Boolean)
    .sort()

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const showingTo = Math.min(total, page * PAGE_SIZE)

  function pageHref(p: number): string {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (pattern) params.set("pattern", pattern)
    if (equipment) params.set("equipment", equipment)
    if (source !== "all") params.set("source", source)
    if (p > 1) params.set("page", String(p))
    const qs = params.toString()
    return qs ? `/coach/library?${qs}` : "/coach/library"
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Exercise Library</h1>
          <p className="mt-1 text-gray-600">
            {total.toLocaleString()} exercises from CoachRx, refreshed daily.
            {total > 0 && (
              <>
                {" "}
                Showing {showingFrom.toLocaleString()}–{showingTo.toLocaleString()}.
              </>
            )}
          </p>
        </div>

        {/* Filters */}
        <form method="get" className="bg-white rounded-lg shadow p-4 mb-6 grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search name…"
            className="border border-gray-300 rounded px-3 py-2 text-sm md:col-span-2"
          />
          <select
            name="pattern"
            defaultValue={pattern}
            className="border border-gray-300 rounded px-3 py-2 text-sm"
          >
            <option value="">All patterns</option>
            {PATTERN_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            name="equipment"
            defaultValue={equipment}
            className="border border-gray-300 rounded px-3 py-2 text-sm"
          >
            <option value="">All equipment</option>
            {equipmentOptions.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <select
            name="source"
            defaultValue={source}
            className="border border-gray-300 rounded px-3 py-2 text-sm"
          >
            <option value="all">All sources</option>
            <option value="stock">Stock CRx</option>
            <option value="custom">Coach-uploaded</option>
          </select>
          <button
            type="submit"
            className="md:col-span-5 bg-primary-600 hover:bg-primary-700 text-white rounded px-4 py-2 text-sm font-medium"
          >
            Filter
          </button>
        </form>

        {/* Results */}
        {rows.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
            No exercises match those filters.{" "}
            <Link href="/coach/library" className="text-primary-600 hover:underline">
              Clear all
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {rows.map((row) => {
              const ytId = youTubeId(row.videoUrl)
              return (
                <a
                  key={row.id}
                  href={row.videoUrl ?? "#"}
                  target={row.videoUrl ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  className="bg-white rounded-lg shadow hover:shadow-lg transition overflow-hidden block"
                >
                  <div className="aspect-video bg-gray-100 relative">
                    {ytId ? (
                      // YouTube CDN thumbnails are free, no API key, no quota.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : row.videoUrl ? (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                        Vimeo / Other
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm">
                        No video
                      </div>
                    )}
                    {row.locked && (
                      <span
                        className="absolute top-2 right-2 bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded"
                        title="Manual edits protected from sync overwrites"
                      >
                        Locked
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="font-medium text-gray-900 text-sm line-clamp-2 min-h-[2.5rem]">
                      {row.name}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {row.isCustom ? (
                        <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-800 rounded">
                          Custom
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                          Stock
                        </span>
                      )}
                      {row.muscleGroups.slice(0, 2).map((g) => (
                        <span
                          key={g}
                          className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded"
                        >
                          {g}
                        </span>
                      ))}
                      {row.equipment.slice(0, 2).map((e) => (
                        <span
                          key={e}
                          className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded"
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                  </div>
                </a>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex justify-between items-center">
            <div className="text-sm text-gray-500">
              Page {page} of {totalPages.toLocaleString()}
            </div>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={pageHref(page - 1)}
                  className="px-3 py-2 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50"
                >
                  ← Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={pageHref(page + 1)}
                  className="px-3 py-2 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50"
                >
                  Next →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
