import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { invalidateLibraryMatcher } from "@/lib/ai/assist"
import { withAlert } from "@/lib/alert"
import { canUseLibraryAi } from "@/lib/library/access"
import { validateSaveEntry } from "@/lib/library/propose"
import { inferMuscles } from "@/lib/muscles/infer"
import { ownerEmails } from "@/lib/plans"
import { prisma } from "@/lib/prisma"

const MAX_ENTRIES = 20

/**
 * Save the entries the coach ticked in the AI library panel.
 * Body: { entries: [{ name, videoUrl, thumbnailUrl, patterns, equipment, cues, summary, replaceId? }] }
 * Each entry is validated again here. One bad entry fails on its own; the rest save.
 */
async function handlePOST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH" || !canUseLibraryAi(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const isOwner = !!session.user.email && ownerEmails().includes(session.user.email.toLowerCase())
  const body = (await req.json().catch(() => ({}))) as { entries?: unknown[] }
  if (!Array.isArray(body.entries) || !body.entries.length || body.entries.length > MAX_ENTRIES) {
    return NextResponse.json({ error: `Send 1 to ${MAX_ENTRIES} entries.` }, { status: 400 })
  }

  // The panel's own key for each row comes back with the result, so a row that
  // failed is matched by identity, not by a name the server may have cleaned.
  const saved: { key?: string; id: string; name: string }[] = []
  const failed: { key?: string; name: string; error: string }[] = []
  for (const input of body.entries) {
    const given = (input ?? {}) as { key?: unknown; name?: unknown }
    const key = typeof given.key === "string" && given.key.length <= 64 ? given.key : undefined
    const withKey = <T extends object>(o: T) => (key === undefined ? o : { key, ...o })
    const v = validateSaveEntry(input)
    if (!v.ok) {
      failed.push(withKey({ name: typeof given.name === "string" ? given.name : "", error: v.error }))
      continue
    }
    const e = v.value
    try {
      if (e.replaceId) {
        const existing = await prisma.exerciseLibrary.findUnique({ where: { id: e.replaceId }, select: { id: true, createdBy: true } })
        if (!existing) {
          failed.push(withKey({ name: e.name, error: "That library entry no longer exists." }))
          continue
        }
        if (!isOwner && existing.createdBy !== session.user.id) {
          failed.push(withKey({ name: e.name, error: "You can only replace the video on exercises you added." }))
          continue
        }
        const row = await prisma.exerciseLibrary.update({
          where: { id: existing.id },
          data: { videoUrl: e.videoUrl, thumbnailUrl: e.thumbnailUrl, locked: true },
          select: { id: true, name: true },
        })
        saved.push(withKey(row))
      } else {
        const muscles = inferMuscles(e.name)
        const row = await prisma.exerciseLibrary.create({
          data: {
            name: e.name,
            category: "Custom",
            difficulty: "Any",
            muscleGroups: e.patterns,
            equipment: e.equipment,
            instructions: e.cues || null,
            description: e.summary || null,
            videoUrl: e.videoUrl,
            thumbnailUrl: e.thumbnailUrl,
            isCustom: true,
            createdBy: session.user.id,
            locked: true,
            primaryMuscles: muscles.primary,
            secondaryMuscles: muscles.secondary,
          },
          select: { id: true, name: true },
        })
        saved.push(withKey(row))
      }
    } catch {
      failed.push(withKey({ name: e.name, error: "Could not save this one. Try again." }))
    }
  }
  if (saved.length) invalidateLibraryMatcher()
  return NextResponse.json({ saved, failed })
}

export const POST = withAlert("library/ai/save", handlePOST)
