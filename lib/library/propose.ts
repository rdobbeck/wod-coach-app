import { noLongDashes } from "@/lib/text"
import type { VideoInfo } from "@/lib/library/youtube"

/**
 * Turning fetched videos into proposed library entries: the prompt the model
 * sees, the strict reading of its answer, the duplicate check, and the shape
 * the save route accepts. Everything here is pure and safe to import from the
 * browser (the panel uses PATTERNS and the types); the database lookups live
 * in vocab.ts.
 */

// The library page's pattern filter vocabulary. The model may use nothing else.
export const PATTERNS = ["Push", "Pull", "Squat", "Bend", "Lunge", "Core", "Cyclical", "Mobility", "Stretch", "Gymnastics", "Plyometric", "Weightlifting", "Carry", "Run"] as const

export type Duplicate = { id: string; name: string }
export type ProposeItem = { line: number; hint?: string; video: VideoInfo; alternatives: VideoInfo[]; duplicate: Duplicate | null }
export type Alternative = { url: string; title: string; seconds: number | null; thumbnailUrl: string | null }
export type ProposedEntry = {
  line: number
  name: string
  videoUrl: string
  thumbnailUrl: string | null
  patterns: string[]
  equipment: string[]
  cues: string
  summary: string
  confidence: "low" | "medium" | "high"
  unknownEquipment: boolean
  duplicate: Duplicate | null
  alternatives: Alternative[]
}

export const SYSTEM = `You are the exercise library assistant inside a strength coach's app. For each YouTube video below, write the library entry a coach would file it under. The coach reviews every entry before it is saved.

Rules:
- "name": the plain standard name of the movement as a coach lists it in an exercise library, no brand names, no invented variations. If the coach gave a name, prefer it unless it is clearly wrong for the video.
- "patterns": one or two from exactly this list: PATTERNS_LIST.
- "equipment": one to three items, preferably from the library's words: EQUIPMENT_LIST. Use another word only when none of those fits.
- "cues": two to five short coaching cues for performing it, drawn from the video's title and description and your knowledge of the movement. Plain sentences.
- "summary": one sentence saying what the movement is for.
- "confidence": "high" when the video is clearly a demo of a single movement, "medium" when you had to infer, "low" when it may not be a demo at all (a vlog, a full workout, a talk).
- If a video is already in the library under a name, say so in "warnings" and still answer for it.
- Never use em dashes or en dashes.

Reply with ONLY a JSON object:
{
  "entries": [
    { "line": 1, "name": "...", "patterns": ["..."], "equipment": ["..."], "cues": "...", "summary": "...", "confidence": "high" | "medium" | "low" }
  ],
  "warnings": ["anything the coach should double check"]
}`

const fmtSeconds = (s: number | null) => (s == null ? "length unknown" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`)

/** The user turn: one block per video, numbered by the coach's line. */
export function renderPrompt(items: ProposeItem[], equipmentVocab: string[]): string {
  const blocks = items.map((it) =>
    [
      `${it.line}  ${it.video.title}`,
      `   channel: ${it.video.channel || "unknown"}, ${fmtSeconds(it.video.seconds)}`,
      it.hint ? `   coach calls it: ${it.hint}` : null,
      it.duplicate ? `   already in the library as: ${it.duplicate.name}` : null,
      it.video.description ? `   description: ${it.video.description.replace(/\s+/g, " ")}` : null,
    ]
      .filter(Boolean)
      .join("\n")
  )
  return [`PATTERNS: ${PATTERNS.join(", ")}`, `EQUIPMENT: ${equipmentVocab.join(", ")}`, `VIDEOS\n${blocks.join("\n\n")}`].join("\n\n")
}

/** The system prompt with the vocabularies filled in. */
export const systemPrompt = (equipmentVocab: string[]) => SYSTEM.replace("PATTERNS_LIST", PATTERNS.join(", ")).replace("EQUIPMENT_LIST", equipmentVocab.join(", "))

const stripFences = (s: string) => s.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? noLongDashes(v.trim()).slice(0, max) : "")
const strList = (v: unknown, max: number, each: number) =>
  (Array.isArray(v) ? v : []).map((x) => str(x, each)).filter(Boolean).slice(0, max)
const toAlt = (v: VideoInfo): Alternative => ({ url: v.url, title: v.title, seconds: v.seconds, thumbnailUrl: v.thumbnailUrl })

/**
 * Read the model's answer into entries that are safe to show. Lines that were
 * not asked about, second answers for a line, and answers with no name are
 * dropped and reported. Patterns outside the fixed list are removed; equipment
 * outside the vocabulary is kept but flagged so the row says so.
 */
export function parseEntries(raw: string, items: ProposeItem[], equipmentVocab: string[]): { entries: ProposedEntry[]; warnings: string[]; dropped: string[] } {
  let j: any
  try {
    j = JSON.parse(stripFences(raw))
  } catch {
    return { entries: [], warnings: [], dropped: ["The model did not answer in the expected format. Try again."] }
  }
  const byLine = new Map(items.map((it) => [it.line, it]))
  const vocab = new Set(equipmentVocab.map((e) => e.toLowerCase()))
  const seen = new Set<number>()
  const entries: ProposedEntry[] = []
  const dropped: string[] = []
  for (const e of Array.isArray(j?.entries) ? j.entries : []) {
    const line = Number(e?.line)
    const it = byLine.get(line)
    if (!it) {
      dropped.push(`The model answered for line ${Number.isFinite(line) ? line : "?"}, which was not asked about.`)
      continue
    }
    const name = str(e?.name, 120)
    if (!name) {
      dropped.push(`The answer for line ${line} had no name.`)
      continue
    }
    if (seen.has(line)) {
      dropped.push(`A second answer for line ${line} was ignored.`)
      continue
    }
    seen.add(line)
    const patterns = strList(e?.patterns, 2, 40).filter((p) => (PATTERNS as readonly string[]).includes(p))
    const equipment = strList(e?.equipment, 4, 40)
    const confidence = e?.confidence === "high" || e?.confidence === "low" ? e.confidence : "medium"
    entries.push({
      line,
      name,
      videoUrl: it.video.url,
      thumbnailUrl: it.video.thumbnailUrl,
      patterns,
      equipment,
      cues: str(e?.cues, 600),
      summary: str(e?.summary, 200),
      confidence,
      unknownEquipment: equipment.some((x) => !vocab.has(x.toLowerCase())),
      duplicate: it.duplicate,
      alternatives: it.alternatives.map(toAlt),
    })
  }
  const warnings = strList(j?.warnings, 10, 400)
  return { entries, warnings, dropped }
}

/** The first of `names` that the matcher resolves to a library entry with a video. */
export function findDuplicate(
  names: string[],
  match: (n: string) => string | null,
  libraryName: (id: string) => string | null,
  hasVideo: (id: string) => boolean
): Duplicate | null {
  for (const n of names) {
    const id = n.trim() ? match(n) : null
    if (id && hasVideo(id)) return { id, name: libraryName(id) ?? n }
  }
  return null
}

export type SaveEntry = { name: string; videoUrl: string; thumbnailUrl: string | null; patterns: string[]; equipment: string[]; cues: string; summary: string; replaceId?: string }

/** The save route trusts nothing from the browser: the same limits as the parser, applied again. */
export function validateSaveEntry(input: unknown): { ok: true; value: SaveEntry } | { ok: false; error: string } {
  const e = (input ?? {}) as Record<string, unknown>
  const name = str(e.name, 120)
  if (!name) return { ok: false, error: "An entry had no name." }
  const videoUrl = str(e.videoUrl, 2000)
  if (!/^https?:\/\//.test(videoUrl)) return { ok: false, error: `${name}: the video link must start with http.` }
  const thumb = str(e.thumbnailUrl, 2000)
  const value: SaveEntry = {
    name,
    videoUrl,
    thumbnailUrl: /^https:\/\//.test(thumb) ? thumb : null,
    patterns: strList(e.patterns, 2, 40).filter((p) => (PATTERNS as readonly string[]).includes(p)),
    equipment: strList(e.equipment, 4, 40),
    cues: str(e.cues, 600),
    summary: str(e.summary, 200),
  }
  const replaceId = str(e.replaceId, 64)
  if (replaceId) value.replaceId = replaceId
  return { ok: true, value }
}
