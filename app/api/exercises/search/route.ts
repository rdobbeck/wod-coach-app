import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { rankExercises } from "@/lib/exercise-search"

/** Library search for the coach exercise picker: GET ?q= -> up to 20 matches, exact name first, then starts-with, then phrase, then video-backed and shorter. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) return NextResponse.json({ results: [] })
  // Fetch every match and rank in code: cutting to N alphabetically first dropped
  // exact names ("Front Squat" sorts after 40 "Axle Bar…"/"Front Rack…" rows).
  const rows = await prisma.exerciseLibrary.findMany({
    where: { AND: q.split(/\s+/).map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) },
    select: { id: true, name: true, videoUrl: true },
    take: 2000,
  })
  return NextResponse.json({ results: rankExercises(q, rows) })
}
