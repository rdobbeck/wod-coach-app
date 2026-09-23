import { redirect } from "next/navigation"
import Chat from "@/components/Chat"
import { resolveThread, threadMessages } from "@/lib/thread"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export default async function ClientMessages() {
  const thread = await resolveThread()
  if (!thread) redirect("/client")

  const messages = await threadMessages(thread.meId, thread.otherId)
  await prisma.message.updateMany({
    where: { senderId: thread.otherId, receiverId: thread.meId, isRead: false },
    data: { isRead: true },
  })

  return (
    <div className="flex min-h-[calc(100vh-10rem)] flex-col gap-4">
      <header>
        <h1 className="font-display text-4xl font-bold leading-none">Messages</h1>
        <p className="mt-1 text-sm text-app-muted">with {thread.otherName}</p>
      </header>
      <Chat
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
