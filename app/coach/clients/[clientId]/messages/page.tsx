import Link from "next/link"
import { notFound } from "next/navigation"
import Chat from "@/components/Chat"
import { resolveThread, threadMessages } from "@/lib/thread"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export default async function CoachMessages({ params }: { params: { clientId: string } }) {
  const thread = await resolveThread(params.clientId)
  if (!thread || !thread.isCoach) notFound()

  const messages = await threadMessages(thread.meId, thread.otherId)
  await prisma.message.updateMany({
    where: { senderId: thread.otherId, receiverId: thread.meId, isRead: false },
    data: { isRead: true },
  })

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-2xl flex-col gap-4 p-6">
      <header>
        <Link href={`/coach/clients/${params.clientId}`} className="text-sm text-gray-500 hover:text-gray-900">
          &larr; {thread.otherName}
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Messages</h1>
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
  )
}
