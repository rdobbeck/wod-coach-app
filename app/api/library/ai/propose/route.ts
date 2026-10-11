import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { libraryMatcher } from "@/lib/ai/assist"
import { completeJson } from "@/lib/ai/chat"
import { decideAssistFunding } from "@/lib/ai/funding"
import { recordUsage, spendMeter } from "@/lib/ai/spend"
import { settleAiCall } from "@/lib/ai-billing"
import { withAlert } from "@/lib/alert"
import { canUseLibraryAi } from "@/lib/library/access"
import { findDuplicate, parseEntries, renderPrompt, systemPrompt, type ProposeItem } from "@/lib/library/propose"
import { equipmentVocab } from "@/lib/library/vocab"
import { oembedInfo, parseLines, searchVideos, videoDetails, YouTubeError, type VideoInfo } from "@/lib/library/youtube"
import { prisma } from "@/lib/prisma"

// Reading twenty videos and one model call can take a while.
export const maxDuration = 120
const MAX_OUTPUT_TOKENS = 8000
const MAX_SEARCHES_PER_ASK = 20
const MAX_SEARCHES_PER_DAY = 60
const SEARCH_MARK = "youtube-search"

/**
 * Turn lines of YouTube links and exercise names into proposed library entries.
 * Body: { text }. Nothing is saved here; the panel sends the ticked rows to /save.
 */
async function handlePOST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH" || !canUseLibraryAi(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const coachId = session.user.id
  const body = (await req.json().catch(() => ({}))) as { text?: string }
  const text = body.text?.trim() ?? ""
  if (!text) return NextResponse.json({ error: "Paste one YouTube link or exercise name per line." }, { status: 400 })

  const funding = await decideAssistFunding(coachId)
  if ("deny" in funding) {
    return NextResponse.json({ error: funding.deny.error, code: funding.deny.code, meter: await spendMeter(coachId) }, { status: 402 })
  }

  const { requests, dropped } = parseLines(text)
  const items: ProposeItem[] = []
  const warnings: string[] = []
  const hasKey = !!process.env.YOUTUBE_API_KEY

  // Links: one Data API call for the batch, or oEmbed one by one without a key.
  const links = requests.filter((r) => r.kind === "link")
  const found = new Map<string, VideoInfo>()
  try {
    if (links.length && hasKey) {
      for (const v of await videoDetails(links.map((l) => l.videoId!))) found.set(v.id, v)
    } else {
      for (const l of links) {
        const v = await oembedInfo(l.videoId!)
        if (v) found.set(v.id, v)
      }
    }
  } catch (e) {
    if (e instanceof YouTubeError && e.code === "QUOTA") return NextResponse.json({ error: e.message }, { status: 503 })
    return NextResponse.json({ error: "Could not reach YouTube. Try again in a moment." }, { status: 503 })
  }
  for (const l of links) {
    const v = found.get(l.videoId!)
    if (!v) dropped.push(`Line ${l.line}: could not read that video (private, removed, or not a video).`)
    else items.push({ line: l.line, hint: l.name, video: v, alternatives: [], duplicate: null })
  }
  if (!hasKey && links.length) warnings.push("No YouTube API key is set, so only each video's title was read, not its description.")

  // Names: one search each, counted against the daily limit.
  const names = requests.filter((r) => r.kind === "name")
  if (names.length && !hasKey) {
    for (const n of names) dropped.push(`Line ${n.line}: set a YouTube API key to search by name.`)
  } else if (names.length) {
    const since = new Date(Date.now() - 24 * 3600_000)
    const usedToday = await prisma.aiUsage.count({ where: { coachId, kind: "library", model: SEARCH_MARK, createdAt: { gte: since } } })
    let allowed = Math.max(0, Math.min(MAX_SEARCHES_PER_ASK, MAX_SEARCHES_PER_DAY - usedToday))
    for (const n of names) {
      if (allowed <= 0) {
        dropped.push(`Line ${n.line}: the daily name-search limit is used up; paste a link instead.`)
        continue
      }
      allowed--
      try {
        const candidates = await searchVideos(n.name!)
        await recordUsage({ coachId, kind: "library", model: SEARCH_MARK, costUsd: 0 })
        if (!candidates.length) dropped.push(`Line ${n.line}: no YouTube demo found for "${n.name}".`)
        else items.push({ line: n.line, hint: n.name, video: candidates[0], alternatives: candidates.slice(1), duplicate: null })
      } catch (e) {
        if (e instanceof YouTubeError && e.code === "QUOTA") return NextResponse.json({ error: e.message }, { status: 503 })
        dropped.push(`Line ${n.line}: could not search YouTube for "${n.name}".`)
      }
    }
  }

  if (!items.length) {
    return NextResponse.json({ entries: [], warnings, dropped, meter: await spendMeter(coachId) })
  }

  // Likely duplicates, by the coach's hint first, then the video title.
  const match = await libraryMatcher()
  for (const it of items) it.duplicate = findDuplicate([it.hint ?? "", it.video.title], match, match.libraryName, match.hasVideo)

  const vocab = await equipmentVocab()
  let out
  try {
    out = await completeJson({ system: systemPrompt(vocab), user: renderPrompt(items, vocab), maxTokens: MAX_OUTPUT_TOKENS })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "The AI service is unavailable.", meter: await spendMeter(coachId) }, { status: 502 })
  }
  await settleAiCall(coachId, { mode: funding.mode }, { kind: "library", model: out.model, tokensIn: out.tokensIn, tokensOut: out.tokensOut, costUsd: out.costUsd })

  if (out.finish === "length") {
    return NextResponse.json({ entries: [], warnings, dropped: [...dropped, "That was too many videos in one go. Try ten or fewer."], meter: await spendMeter(coachId) })
  }
  const parsed = parseEntries(out.content, items, vocab)
  return NextResponse.json({
    entries: parsed.entries,
    warnings: [...warnings, ...parsed.warnings],
    dropped: [...dropped, ...parsed.dropped],
    meter: await spendMeter(coachId),
  })
}

export const POST = withAlert("library/ai/propose", handlePOST)
