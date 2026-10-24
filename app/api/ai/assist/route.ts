import { NextResponse } from "next/server"
import { aiAccess, denialResponse, isDenied } from "@/lib/ai/access"
import { withAlert } from "@/lib/alert"
import { decideAssistFunding } from "@/lib/ai/funding"
import { spendMeter } from "@/lib/ai/spend"
import { settleAiCall } from "@/lib/ai-billing"
import { buildContext, callModel, explainEmpty, libraryMatcher, mergeProposals, parseProposal, splitContext, type Proposal, type Turn } from "@/lib/ai/assist"
import { askJev, type JevAnswer } from "@/lib/ai/decide"
import { checksOn, changeLines, MISMATCH_WARNING, POST_QUESTIONS, postDecision, PRE_QUESTIONS, preDecision, preState, shouldPreCheck, type Intent, type PreCheck } from "@/lib/ai/check"
import { restate, RESTATE_MODEL } from "@/lib/ai/restate"

// A large redesign can take a minute or two.
export const maxDuration = 120

// Past this, a retry after an empty answer could run into the time limit, so it is skipped.
const RETRY_BEFORE_MS = 50_000
const RETRY_NUDGE = "\n\nYour previous answer made no changes. The request is a change; make it, or ask one specific question."

const noulOf = (a: JevAnswer) => (a.type === "noul" ? a.noul : 0)
const toPreCheck = (answers: Record<"clear" | "intent", JevAnswer>): PreCheck => {
  const intent = answers.intent.type === "choice" ? (answers.intent.choice as Intent) : "unclear"
  const intentP = answers.intent.type === "choice" ? (answers.intent.probabilities[intent] ?? 0) : 0
  return { intent, intentP, clear: noulOf(answers.clear) }
}

/**
 * Ask the AI box a question or a change about one client.
 * Body: { clientId, message, history?: [{ role, content }], confirmed? }
 * Returns the reply, the proposed edits (nothing is saved), and the month's spend.
 * A vague ask instead gets { confirm: { kind, text } }: what it seems to want, to say yes to
 * (resent with confirmed: true) or correct. The Jev checks fail open: any error proceeds as before.
 */
async function handlePOST(req: Request) {
  const started = Date.now()
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; message?: string; history?: Turn[]; confirmed?: boolean }
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
  const confirmed = body.confirmed === true

  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((t) => (t?.role === "user" || t?.role === "assistant") && typeof t.content === "string")
    .slice(-6)

  const ctx = await buildContext(body.clientId)
  const settle = (model: string, costUsd: number, tokensIn = 0, tokensOut = 0) =>
    settleAiCall(coachId, { mode }, { kind: "assist", clientId: body.clientId!, model, costUsd, tokensIn, tokensOut })

  // Pre-check: is the ask clear enough to act on? Its cost rides on the first paid call, never its own row.
  let check: PreCheck | null = null
  let preCost = 0
  if (shouldPreCheck({ confirmed, on: checksOn() })) {
    try {
      const pre = await askJev(preState(ctx, message, history), PRE_QUESTIONS)
      check = toPreCheck(pre.answers)
      preCost = pre.costUsd
    } catch (e) {
      console.warn("[ai-check]", "pre-check failed", e)
    }
  }
  if (check && preDecision(check) === "confirm") {
    try {
      const r = await restate(preState(ctx, message, history), access.viewer)
      await settle(RESTATE_MODEL(), preCost + r.costUsd)
      return NextResponse.json({ confirm: { kind: r.kind, text: r.text }, check: { intent: check.intent, clear: check.clear }, meter: await spendMeter(coachId) })
    } catch (e) {
      console.warn("[ai-check]", "restate failed", e)
    }
  }

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
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status !== "fulfilled") continue
    const out = r.value
    await settle(out.model, out.costUsd + (i === 0 ? preCost : 0), out.tokensIn, out.tokensOut)
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
  let proposal = parts.length === 1 ? proposals[0]! : mergeProposals(proposals)
  const checkOut = (matches?: number | null) => check ? { intent: check.intent, clear: check.clear, ...(matches == null ? {} : { matches }) } : undefined
  if (parts.length === 1 && results[0].status === "fulfilled" && results[0].value.finish === "length") {
    return NextResponse.json({ ...proposal, reply: proposal.dropped[0], dropped: [], check: checkOut(), meter: await spendMeter(coachId) })
  }

  // Post-check: do the edits do what was asked? No edits for a change ask gets one more try; a miss gets a warning.
  let matches: number | null = null
  if (checksOn() && check?.intent !== "question") {
    let postCost = 0
    try {
      const post = await askJev({ message, proposed_changes: changeLines(proposal.changes) || "none" }, POST_QUESTIONS)
      matches = noulOf(post.answers.matches)
      postCost = post.costUsd
    } catch (e) {
      console.warn("[ai-check]", "post-check failed", e)
    }
    const decision = postDecision(check?.intent ?? "unclear", matches, proposal.changes.length)
    if (decision === "retry" && Date.now() - started < RETRY_BEFORE_MS) {
      try {
        const again = await callModel(parts[0], message + RETRY_NUDGE, history)
        // The retry is real money and its own row; the post-check cost rides on it.
        await settle(again.model, again.costUsd + postCost, again.tokensIn, again.tokensOut)
        if (again.finish !== "length") {
          const retried = parseProposal(again.content, parts[0], match, match.libraryName, match.hasVideo)
          if (retried.changes.length) proposal = retried
        }
      } catch (e) {
        console.warn("[ai-check]", "retry failed", e)
      }
    } else if (decision === "warn") {
      proposal = { ...proposal, warnings: [...proposal.warnings, MISMATCH_WARNING], autoApply: false }
    }
  }

  return NextResponse.json({ ...explainEmpty(proposal), check: checkOut(matches), meter: await spendMeter(coachId) })
}

export const POST = withAlert("ai/assist", handlePOST)
