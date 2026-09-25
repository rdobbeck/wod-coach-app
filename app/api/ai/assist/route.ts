import { NextResponse } from "next/server"
import { coachOf } from "@/lib/coach-access"
import { withAlert } from "@/lib/alert"
import { AiCapError, assertUnderCap, spendMeter } from "@/lib/ai/spend"
import { ASSIST_MIN_CENTS, settleAiCall } from "@/lib/ai-billing"
import { getCoachPlan } from "@/lib/plans"
import { prisma } from "@/lib/prisma"
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

  const session = await coachOf(body.clientId)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const coachId = session.user.id

  // Included on Pro and Studio up to the monthly cap; otherwise (or past the cap)
  // each message comes out of the coach's AI balance.
  const [{ plan }, profile] = await Promise.all([
    getCoachPlan(coachId),
    prisma.coachProfile.findUnique({ where: { userId: coachId }, select: { aiBalanceCents: true } }),
  ])
  const balance = profile?.aiBalanceCents ?? 0
  let mode: "allowance" | "balance" = "balance"
  if (plan.assistant) {
    try {
      await assertUnderCap(coachId)
      mode = "allowance"
    } catch (e) {
      if (!(e instanceof AiCapError)) throw e
      if (balance < ASSIST_MIN_CENTS) {
        return NextResponse.json({ error: e.message, code: e.code, meter: await spendMeter(coachId) }, { status: 402 })
      }
    }
  }
  if (mode === "balance" && balance < ASSIST_MIN_CENTS) {
    return NextResponse.json(
      { error: "The AI assistant comes with Pro and Studio. Or add AI balance in Settings, Plan & billing and pay a few cents a message.", code: "AI_FUNDS", meter: await spendMeter(coachId) },
      { status: 402 },
    )
  }

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
  const proposal = parseProposal(out.content, ctx, match, match.libraryName)
  return NextResponse.json({ ...proposal, meter: await spendMeter(coachId) })
}

export const POST = withAlert("ai/assist", handlePOST)
