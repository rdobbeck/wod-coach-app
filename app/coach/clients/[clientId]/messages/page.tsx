import Link from "next/link"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import DashboardHeader from "@/components/DashboardHeader"
import { notFound } from "next/navigation"
import Chat from "@/components/Chat"
import { resolveThread, threadMessages } from "@/lib/thread"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export default async function CoachMessages({ params }: { params: { clientId: string } }) {
  const session = await getServerSession(authOptions)
  const thread = await resolveThread(params.clientId)
  if (!thread || !thread.isCoach) notFound()

  const messages = await threadMessages(thread.meId, thread.otherId)
  await prisma.message.updateMany({
    where: { senderId: thread.otherId, receiverId: thread.meId, isRead: false },
    data: { isRead: true },
  })

  return (
    <div className="min-h-screen bg-[#f4f2ed]">
      <DashboardHeader userName={session?.user.name || "Coach"} role="COACH" />
      <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-2xl flex-col gap-4 px-4 py-8 sm:px-6">
      <header>
        <Link href={`/coach/clients/${params.clientId}`} className="text-sm text-[#6b6257] hover:text-[#16181d]">
          &larr; {thread.otherName}
        </Link>
        <h1 className="mt-1 font-display text-4xl font-bold text-[#16181d]">Messages</h1>
      </header>
      <Chat
        tone="coach"
        clientId={params.clientId}
        otherName={thread.otherName}
        initial={messages.map((m) => ({
          id: m.id,
          mine: m.senderId === thread.meId,
          body: m.content,
          at: m.createdAt.toISOString(),
        }))}
      />
      </div>
    </div>
  )
}
