import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withAlert } from "@/lib/alert"
import { exerciseKey } from "@/lib/exercise-key"
import { canUseLibraryAi } from "@/lib/library/access"
import { validateMuscles } from "@/lib/muscles/validate"
import { prisma } from "@/lib/prisma"

/**
 * Ryan confirms or corrects an exercise's muscles from the review screen.
 * Body: { primary: string[], secondary: string[] } (training-group ids, lib/muscles/groups.ts).
 * Saved on every library row with the same name (the library has duplicates, and clients should
 * see one answer) and stamped reviewed, so scripts/add-exercise-muscles.ts never redrafts them.
 */
async function handlePATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH" || !canUseLibraryAi(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const v = validateMuscles(await req.json().catch(() => null))
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const target = await prisma.exerciseLibrary.findUnique({ where: { id: params.id }, select: { name: true } })
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const key = exerciseKey(target.name)
  const all = await prisma.exerciseLibrary.findMany({ select: { id: true, name: true } })
  const ids = all.filter((r) => exerciseKey(r.name) === key).map((r) => r.id)
  const reviewedAt = new Date()
  const { count } = await prisma.exerciseLibrary.updateMany({
    where: { id: { in: ids } },
    data: { primaryMuscles: v.value.primary, secondaryMuscles: v.value.secondary, musclesReviewedAt: reviewedAt },
  })
  return NextResponse.json({ updated: count, primary: v.value.primary, secondary: v.value.secondary, reviewedAt: reviewedAt.toISOString() })
}

export const PATCH = withAlert("exercises/muscles", handlePATCH)
