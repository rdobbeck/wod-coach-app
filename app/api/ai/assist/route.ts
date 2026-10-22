import { NextResponse } from "next/server"
import { aiAccess, denialResponse, isDenied } from "@/lib/ai/access"
import { withAlert } from "@/lib/alert"
import { decideAssistFunding } from "@/lib/ai/funding"
import { spendMeter } from "@/lib/ai/spend"
import { settleAiCall } from "@/lib/ai-billing"
import { buildContext, callModel, libraryMatcher, mergeProposals, parseProposal, splitContext, type Proposal, type Turn } from "@/lib/ai/assist"

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
  // A big program is asked about in parts, all at once, so no single answer runs past the time limit.
  const parts = splitContext(ctx)
  // An empty answer (it happens now and then) gets one more try, so the coach isn't told to rephrase a fine request.
  const ask = async (p: (typeof parts)[number]) => {
    const first = await callModel(p, message, history)
    if (first.content.trim() || first.finish === "length") return first
    const again = await callModel(p, message, history)
    return { ...again, costUsd: first.costUsd + again.costUsd, tokensIn: first.tokensIn + again.tokensIn, tokensOut: first.tokensOut + again.tokensOut }
  }
  const results = await Promise.allSettled(parts.map(ask))
  if (results.every((r) => r.status === "rejected")) {
    const e = (results[0] as PromiseRejectedResult).reason as Error
    return NextResponse.json({ error: e?.message || "The AI service is unavailable.", meter: await spendMeter(coachId) }, { status: 502 })
  }
  // The money is spent whether or not an answer turns out usable.
  for (const r of results) {
    if (r.status !== "fulfilled") continue
    const out = r.value
    await settleAiCall(coachId, { mode }, { kind: "assist", clientId: body.clientId, model: out.model, tokensIn: out.tokensIn, tokensOut: out.tokensOut, costUsd: out.costUsd })
  }

  const match = await libraryMatcher()
  const proposals: (Proposal | null)[] = results.map((r, i) => {
    if (r.status !== "fulfilled") return null
    // Cut off at the length limit: the JSON is unfinished, so say so instead of showing a half answer.
    if (r.value.finish === "length") {
      return { reply: "", changes: [], warnings: [], autoApply: false, dropped: [parts.length > 1 ? `Part ${i + 1} of the program was too big to do in one go; ask again for those sessions.` : "That was too big to do in one go. Try a narrower ask, like one or two weeks, or one part of the session."] }
    }
    return parseProposal(r.value.content, parts[i], match, match.libraryName, match.hasVideo)
  })
  const proposal = parts.length === 1 ? proposals[0]! : mergeProposals(proposals)
  if (parts.length === 1 && results[0].status === "fulfilled" && results[0].value.finish === "length") {
    return NextResponse.json({ ...proposal, reply: proposal.dropped[0], dropped: [], meter: await spendMeter(coachId) })
  }
  return NextResponse.json({ ...proposal, meter: await spendMeter(coachId) })
}

export const POST = withAlert("ai/assist", handlePOST)
