import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAlert } from "@/lib/alert"
import { aiAccess, denialResponse, isDenied } from "@/lib/ai/access"
import { sanitizeMessages } from "@/lib/ai/thread"

/**
 * The saved Ask AI conversation for this person about this client.
 *   GET    ?clientId=            -> { messages }
 *   PUT    { clientId, messages } -> { ok, saved }
 *   DELETE ?clientId=            -> { ok }
 */
const clientIdFrom = (req: Request) => new URL(req.url).searchParams.get("clientId") ?? ""

async function handleGET(req: Request) {
  const clientId = clientIdFrom(req)
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 })
  const access = await aiAccess(clientId)
  if (isDenied(access)) return denialResponse(access)
  const row = await prisma.aiThread.findUnique({ where: { userId_clientId: { userId: access.userId, clientId } }, select: { messages: true } })
  return NextResponse.json({ messages: row?.messages ?? [] })
}

async function handlePUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; messages?: unknown }
  if (!body.clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 })
  const access = await aiAccess(body.clientId)
  if (isDenied(access)) return denialResponse(access)
  let messages
  try {
    messages = sanitizeMessages(body.messages)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
  await prisma.aiThread.upsert({
    where: { userId_clientId: { userId: access.userId, clientId: body.clientId } },
    update: { messages: messages as never },
    create: { userId: access.userId, clientId: body.clientId, messages: messages as never },
  })
  return NextResponse.json({ ok: true, saved: messages.length })
}

async function handleDELETE(req: Request) {
  const clientId = clientIdFrom(req)
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 })
  const access = await aiAccess(clientId)
  if (isDenied(access)) return denialResponse(access)
  await prisma.aiThread.deleteMany({ where: { userId: access.userId, clientId } })
  return NextResponse.json({ ok: true })
}

export const GET = withAlert("ai/assist/thread", handleGET)
export const PUT = withAlert("ai/assist/thread", handlePUT)
export const DELETE = withAlert("ai/assist/thread", handleDELETE)
