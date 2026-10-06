import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * Who may use Ask AI about `clientId`, and whose allowance pays.
 *
 * A coach of the client pays for themselves. The client may ask about their
 * own training once their coach switched it on; the active coach link with
 * the earliest start date is the one that pays. Everyone else is turned away:
 * 403 when it is the client with the switch off (so the page can explain),
 * 401 otherwise.
 */
export type AiAccess = { viewer: "coach" | "client"; userId: string; coachId: string }
export type AiDenied = { denied: 401 | 403 }

export const CLIENT_OFF_MESSAGE = "Your coach hasn't switched on Ask AI for you yet."

export async function aiAccess(clientId: string): Promise<AiAccess | AiDenied> {
  const session = await getServerSession(authOptions)
  if (!session) return { denied: 401 }
  const userId = session.user.id

  if (session.user.role === "COACH") {
    const link = await prisma.clientCoach.findUnique({ where: { clientId_coachId: { clientId, coachId: userId } } })
    return link ? { viewer: "coach", userId, coachId: userId } : { denied: 401 }
  }

  if (userId !== clientId) return { denied: 401 }
  const [profile, link] = await Promise.all([
    prisma.clientProfile.findUnique({ where: { userId: clientId }, select: { canAskAi: true } }),
    prisma.clientCoach.findFirst({ where: { clientId, status: "ACTIVE" }, orderBy: { startDate: "asc" }, select: { coachId: true } }),
  ])
  if (!link) return { denied: 401 }
  if (!profile?.canAskAi) return { denied: 403 }
  return { viewer: "client", userId, coachId: link.coachId }
}

export const isDenied = (a: AiAccess | AiDenied): a is AiDenied => "denied" in a

/** The JSON response for a denial, so every AI route says the same thing. */
export function denialResponse(a: AiDenied) {
  return Response.json({ error: a.denied === 403 ? CLIENT_OFF_MESSAGE : "Unauthorized", code: a.denied === 403 ? "AI_OFF" : undefined }, { status: a.denied })
}
