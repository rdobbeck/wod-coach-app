import { prisma } from "@/lib/prisma"
import { normalizeSlug, slugProblem } from "@/lib/coach-link"

/** Validates a requested slug and checks nobody else has it. */
export async function checkSlug(raw: string, userId?: string) {
  const slug = normalizeSlug(raw)
  const problem = slugProblem(slug)
  if (problem) return { slug, ok: false as const, error: problem }
  const taken = await prisma.coachProfile.findUnique({ where: { slug }, select: { userId: true } })
  if (taken && taken.userId !== userId) return { slug, ok: false as const, error: "Already taken" }
  return { slug, ok: true as const }
}
