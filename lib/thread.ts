import { getServerSession } from "next-auth"
import { authOptions } from "./auth"
import { prisma } from "./prisma"

/**
 * Who is allowed to talk to whom. A thread is always one coach and one of
 * their clients, so both sides resolve to the same pair of user ids.
 */
export type Thread = { meId: string; meName: string; otherId: string; otherName: string; isCoach: boolean }

/** Resolve the thread between the signed-in user and `clientId` (their own id, for a client). */
export async function resolveThread(clientId?: string | null): Promise<Thread | null> {
  const session = await getServerSession(authOptions)
  if (!session) return null
  const meName = session.user.name ?? session.user.email ?? "Someone"

  if (session.user.role === "COACH") {
    if (!clientId) return null
    const link = await prisma.clientCoach.findUnique({
      where: { clientId_coachId: { clientId, coachId: session.user.id } },
      include: { client: { select: { id: true, name: true, email: true } } },
    })
    if (!link) return null
    return {
      meId: session.user.id,
      meName,
      otherId: link.client.id,
      otherName: link.client.name ?? link.client.email ?? "Client",
      isCoach: true,
    }
  }

  // A client talks to their active coach. If they somehow have several, the first wins.
  const link = await prisma.clientCoach.findFirst({
    where: { clientId: session.user.id, status: "ACTIVE" },
    include: { coach: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  })
  if (!link) return null
  return {
    meId: session.user.id,
    meName,
    otherId: link.coach.id,
    otherName: link.coach.name ?? link.coach.email ?? "Coach",
    isCoach: false,
  }
}

/** Every message between the two, oldest first. */
export async function threadMessages(a: string, b: string) {
  return prisma.message.findMany({
    where: {
      OR: [
        { senderId: a, receiverId: b },
        { senderId: b, receiverId: a },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 300,
  })
}

/** Count of messages sent to `userId` that they have not opened yet. */
export function unreadCount(userId: string, fromId?: string) {
  return prisma.message.count({ where: { receiverId: userId, isRead: false, ...(fromId ? { senderId: fromId } : {}) } })
}
