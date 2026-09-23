import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * Coach adds an exercise to the library with a demo video link.
 * Body: { name, videoUrl }. Custom entries have no CoachRx id, so the nightly
 * CoachRx sync never overwrites them.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { name, videoUrl } = (await req.json()) as { name?: string; videoUrl?: string }
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })
  if (videoUrl && !/^https?:\/\//.test(videoUrl.trim())) return NextResponse.json({ error: "Video link must start with http" }, { status: 400 })
  const exercise = await prisma.exerciseLibrary.create({
    data: {
      name: name.trim(),
      videoUrl: videoUrl?.trim() || null,
      category: "Custom",
      difficulty: "Any",
      muscleGroups: [],
      equipment: [],
      isCustom: true,
      createdBy: session.user.id,
      locked: true,
    },
    select: { id: true, name: true, videoUrl: true },
  })
  return NextResponse.json({ exercise })
}
