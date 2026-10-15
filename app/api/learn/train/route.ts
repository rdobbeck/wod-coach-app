import { NextResponse } from "next/server"
import { withAlert } from "@/lib/alert"
import { groupLabel, isGroupId } from "@/lib/muscles/groups"
import { rankForGroup } from "@/lib/muscles/rank"
import { usageCounts } from "@/lib/muscles/usage"
import { prisma } from "@/lib/prisma"

/**
 * Train it: up to six library exercises with demo videos for one training group, most used first.
 * Public, like the Learn pages that show it: the library is Ryan's catalogue. Cached at the edge.
 */
async function handleGET(req: Request) {
  const group = new URL(req.url).searchParams.get("group")
  if (!isGroupId(group)) return NextResponse.json({ error: "Unknown muscle group" }, { status: 404 })
  const [rows, uses] = await Promise.all([
    prisma.exerciseLibrary.findMany({
      where: { videoUrl: { not: null }, OR: [{ primaryMuscles: { has: group } }, { secondaryMuscles: { has: group } }] },
      select: { id: true, name: true, videoUrl: true, primaryMuscles: true, secondaryMuscles: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    usageCounts(),
  ])
  return NextResponse.json(
    { group, label: groupLabel(group), exercises: rankForGroup(rows, group, uses) },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" } },
  )
}

export const GET = withAlert("learn/train", handleGET)
