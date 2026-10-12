import { NextResponse } from "next/server"
import { aiAccess, denialResponse, isDenied } from "@/lib/ai/access"
import { withAlert } from "@/lib/alert"
import { decideAssistFunding } from "@/lib/ai/funding"
import { spendMeter } from "@/lib/ai/spend"
import { settleAiCall } from "@/lib/ai-billing"
import { buildContext, callModel, libraryMatcher, parseProposal, type Turn } from "@/lib/ai/assist"

// A large redesign can take a minute or two.
export const maxDuration = 120

/**
 * Ask the AI box a question or a change about one client.
 * Body: { clientId, message, history?: [{ role, content }] }
 * Returns the reply, the proposed edits (nothing is saved), and the month's spend.
 */
async function handlePOST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; message?: string; history?: Turn[] }
  const message = body.message?.trim()
  if (!body.clientId || !message) return NextResponse.json({ error: "clientId and message are required" }, { status: 400 })
  if (message.length > 2000) return NextResponse.json({ error: "That message is too long. Keep it under 2,000 characters." }, { status: 400 })

  const access = await aiAccess(body.clientId)
  if (isDenied(access)) return denialResponse(access)
  const coachId = access.coachId
  // A client is spending their coach's allowance, so money messages are written for them, not the coach.
  const forClient = (coachText: string) => (access.viewer === "client" ? "Your coach's AI allowance is used up for this month. Ask them to top it up." : coachText)

  const funding = await decideAssistFunding(coachId)
  if ("deny" in funding) {
    return NextResponse.json({ error: forClient(funding.deny.error), code: funding.deny.code, meter: await spendMeter(coachId) }, { status: 402 })
  }
  const mode = funding.mode

  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((t) => (t?.role === "user" || t?.role === "assistant") && typeof t.content === "string")
    .slice(-6)

  const ctx = await buildContext(body.clientId)
  let out
  try {
    out = await callModel(ctx, message, history)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "The AI service is unavailable.", meter: await spendMeter(coachId) }, { status: 502 })
  }
  // The money is spent whether or not the answer turns out usable.
  await settleAiCall(coachId, { mode }, { kind: "assist", clientId: body.clientId, model: out.model, tokensIn: out.tokensIn, tokensOut: out.tokensOut, costUsd: out.costUsd })

  // Cut off at the length limit: the JSON is unfinished, so say so instead of showing a half answer.
  if (out.finish === "length") {
    return NextResponse.json({
      reply: "That was too big to do in one go. Try a narrower ask, like one or two weeks, or one part of the session.",
      changes: [],
      warnings: [],
      dropped: [],
      autoApply: false,
      meter: await spendMeter(coachId),
    })
  }

  const match = await libraryMatcher()
  const proposal = parseProposal(out.content, ctx, match, match.libraryName, match.hasVideo)
  return NextResponse.json({ ...proposal, meter: await spendMeter(coachId) })
}

export const POST = withAlert("ai/assist", handlePOST)
