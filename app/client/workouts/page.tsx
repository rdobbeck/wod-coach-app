import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getHistoryOverview } from "@/lib/training"
import HistoryView from "@/components/client/HistoryView"

export default async function ClientHistory() {
  const session = (await getServerSession(authOptions))!
  const [{ workouts, exercises }, profile] = await Promise.all([
    getHistoryOverview(session.user.id),
    prisma.clientProfile.findUnique({ where: { userId: session.user.id } }),
  ])
  return <HistoryView units={profile?.units ?? "lb"} workouts={workouts} exercises={exercises} />
}
