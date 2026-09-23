import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveThread, threadMessages } from "@/lib/thread"
import { notifyUser } from "@/lib/notify"

const shape = (m: { id: string; senderId: string; content: string; createdAt: Date }, meId: string) => ({
  id: m.id,
  mine: m.senderId === meId,
  body: m.content,
  at: m.createdAt.toISOString(),
})

/** The thread, newest last. Opening it marks what the other side sent as read. */
export async function GET(req: Request) {
  const clientId = new URL(req.url).searchParams.get("clientId")
  const thread = await resolveThread(clientId)
  if (!thread) return NextResponse.json({ error: "No thread" }, { status: 404 })

  const messages = await threadMessages(thread.meId, thread.otherId)
  await prisma.message.updateMany({
    where: { senderId: thread.otherId, receiverId: thread.meId, isRead: false },
    data: { isRead: true },
  })
  return NextResponse.json({ messages: messages.map((m) => shape(m, thread.meId)) })
}

/** Send a message to the other side of the thread. */
export async function POST(req: Request) {
  const { body, clientId } = (await req.json()) as { body?: string; clientId?: string }
  const thread = await resolveThread(clientId)
  if (!thread) return NextResponse.json({ error: "No thread" }, { status: 404 })

  const text = body?.trim()
  if (!text) return NextResponse.json({ error: "Write something first" }, { status: 400 })
  if (text.length > 4000) return NextResponse.json({ error: "That's too long" }, { status: 400 })

  const message = await prisma.message.create({
    data: { senderId: thread.meId, receiverId: thread.otherId, content: text },
  })
  await notifyUser(thread.otherId, {
    title: `${thread.meName} sent you a message`,
    body: text.slice(0, 140),
    url: thread.isCoach ? "/client/messages" : `/coach/clients/${thread.meId}/messages`,
    tag: `chat-${thread.meId}`,
  })
  return NextResponse.json({ message: shape(message, thread.meId) })
}
