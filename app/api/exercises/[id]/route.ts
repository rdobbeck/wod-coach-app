import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { invalidateLibraryMatcher } from "@/lib/ai/assist"
import { ownerEmails } from "@/lib/plans"
import { prisma } from "@/lib/prisma"

/**
 * Coach sets or clears the demo video on a library exercise.
 * Body: { videoUrl: "https://..." | null }. A hand-set video locks the row so
 * a library sync never puts the old one back.
 *
 * The library is one pool every coach sees, so a coach may only change entries
 * they added themselves; owner accounts may change any entry, including the
 * synced ones.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const isOwner = !!session.user.email && ownerEmails().includes(session.user.email.toLowerCase())
  const body = (await req.json().catch(() => ({}))) as { videoUrl?: string | null }
  if (!("videoUrl" in body)) return NextResponse.json({ error: "videoUrl is required (null clears it)" }, { status: 400 })
  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : ""
  if (videoUrl && !/^https?:\/\//.test(videoUrl)) return NextResponse.json({ error: "Video link must start with http" }, { status: 400 })
  if (videoUrl.length > 2000) return NextResponse.json({ error: "That link is too long" }, { status: 400 })

  const existing = await prisma.exerciseLibrary.findUnique({ where: { id: params.id }, select: { id: true, createdBy: true } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!isOwner && existing.createdBy !== session.user.id) {
    return NextResponse.json({ error: "You can only change the video on exercises you added." }, { status: 403 })
  }
  const exercise = await prisma.exerciseLibrary.update({
    where: { id: params.id },
    data: { videoUrl: videoUrl || null, locked: true },
    select: { id: true, name: true, videoUrl: true },
  })
  invalidateLibraryMatcher()
  return NextResponse.json({ exercise })
}
