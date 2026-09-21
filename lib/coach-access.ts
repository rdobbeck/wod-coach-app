import { getServerSession } from "next-auth"
import { authOptions } from "./auth"
import { prisma } from "./prisma"

/** Session of a coach who coaches `clientId`, or null. */
export async function coachOf(clientId: string) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return null
  const link = await prisma.clientCoach.findUnique({
    where: { clientId_coachId: { clientId, coachId: session.user.id } },
  })
  return link ? session : null
}
