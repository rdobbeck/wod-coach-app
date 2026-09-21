import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/** Library search for the coach exercise picker: GET ?q= -> up to 20 matches, video-backed first. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) return NextResponse.json({ results: [] })
  const rows = await prisma.exerciseLibrary.findMany({
    where: { AND: q.split(/\s+/).map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) },
    select: { id: true, name: true, videoUrl: true },
    orderBy: [{ videoUrl: { sort: "desc", nulls: "last" } }, { name: "asc" }],
    take: 40,
  })
  // Shorter names first ("Back Squat" before "Back Squat to Box w/ Chains").
  rows.sort((a, b) => Number(!!b.videoUrl) - Number(!!a.videoUrl) || a.name.length - b.name.length)
  return NextResponse.json({ results: rows.slice(0, 20) })
}
