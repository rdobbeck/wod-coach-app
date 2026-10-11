# AI Library Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An "Add with AI" panel on the coach library page that turns YouTube links or exercise names into reviewed, saved library entries with video, pattern tags, equipment and cues.

**Architecture:** Pure helpers in `lib/library/` (URL parsing, YouTube fetch with an injectable `fetch`, prompt rendering, strict parsing) are unit-tested without network. Two API routes orchestrate them: `propose` (gate, fund, fetch, duplicate check, one model call, settle) and `save` (validate again, write rows, bust the matcher cache). A client panel component holds the proposal in component state and calls both routes.

**Tech Stack:** Next.js 14 app router (route params are plain objects), Prisma on Supabase Postgres (`DB_SCHEMA=preview` locally), OpenRouter via `fetch`, YouTube Data API v3 via `fetch`, Playwright tests (`npx playwright test tests/<file>`), sonner toasts.

**Spec:** `docs/superpowers/specs/2026-10-11-ai-library-builder-design.md`

## Global Constraints

- No schema change. `AiUsage.kind` is a plain `String` column; new values are `library` and `library_paid`.
- Never write em dashes or en dashes to the database or UI copy: pass every model string through `noLongDashes` from `lib/text`.
- Access: owner accounts (`ownerEmails()` in `lib/plans.ts`) plus emails in `LIBRARY_AI_COACH_EMAILS`. Non-allowed coaches get 401 with `{ error: "Unauthorized" }`.
- Limits: 20 lines per ask; a line over 200 characters is rejected; name searches capped at 20 per ask and 60 per account per day; route `maxDuration = 120`.
- Model: `ASSIST_MODEL()` from `lib/ai/assist.ts` (Sonnet 5 unless `AI_ASSIST_MODEL` says otherwise), `max_tokens` 8000.
- Patterns are only ever from the fixed list: `Push, Pull, Squat, Bend, Lunge, Core, Cyclical, Mobility, Stretch, Gymnastics, Plyometric, Weightlifting, Carry, Run`.
- Saved rows: `category "Custom"`, `difficulty "Any"`, `muscleGroups = patterns`, `equipment`, `instructions = cues`, `description = summary`, `videoUrl`, `thumbnailUrl`, `isCustom true`, `createdBy`, `locked true`. Replace writes only `videoUrl`, `thumbnailUrl`, `locked`.
- Every library write ends with `invalidateLibraryMatcher()` from `lib/ai/assist.ts`.
- Commits end with the two attribution lines used throughout this repo (see any recent `git log -1`).
- Tests run against the preview schema; clean up every row you create with a `PW LibAI ` name prefix in `finally` blocks.

## Review Focus

1. A pasted line that is a YouTube *playlist* or *channel* URL (`youtube.com/playlist?list=...`): it is not a video and must land under "Left out" with "not a video link", never be searched as a name. Test added to Task 2 (`parseLines`).
2. A video that is private, deleted, or age-gated: `videos.list` returns an empty `items` array for it, not an error. The line must be reported as "Could not read that video", and the rest of the batch must still be proposed. Test added to Task 2 (`videoDetails` with a missing id).
3. The model returns an entry whose `line` points at a request that was dropped during fetching: it must be ignored, not saved against the wrong video. Test added to Task 3 (`parseEntries`).
4. A save with `replaceId` pointing at an entry that no longer exists, or that belongs to another coach when the caller is not an owner: the single entry fails with a message and the rest of the batch saves. Test added to Task 4.
5. Two lines in one ask that resolve to the same video id (short and watch form of one link): collapse to one request so the coach is not shown two identical proposals. Test added to Task 2 (`parseLines`).

---

### Task 1: Access gate and the test allowlist

**Files:**
- Create: `lib/library/access.ts`
- Modify: `.env.local` (add one line; this file is not committed)
- Test: `tests/library-ai.spec.ts` (new file; later tasks add to it)

**Interfaces:**
- Produces: `canUseLibraryAi(email: string | null | undefined): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/library-ai.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { dbUrl } from "../lib/db-url"
import { canUseLibraryAi } from "../lib/library/access"

/**
 * The AI library builder: who may use it, reading YouTube links and names,
 * turning the model's answer into entries, saving them, and the panel. No test
 * calls YouTube or a model: the pure helpers take fakes, the panel test mocks
 * the propose route, and saving is real.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })
const PREFIX = "PW LibAI "

let coachId = ""
test.beforeAll(async () => {
  coachId = (await prisma.user.findUniqueOrThrow({ where: { email: "playwright-coach@dev.local" } })).id
})
test.afterAll(async () => {
  await prisma.exerciseLibrary.deleteMany({ where: { name: { startsWith: PREFIX } } })
  await prisma.aiUsage.deleteMany({ where: { coachId, kind: { in: ["library", "library_paid"] } } })
  await prisma.$disconnect()
})

// ---------- access ----------

test("owners and the allowlist may use the library builder; nobody else", () => {
  const saved = process.env.LIBRARY_AI_COACH_EMAILS
  try {
    process.env.LIBRARY_AI_COACH_EMAILS = " Alice@Example.com ,bob@example.com"
    expect(canUseLibraryAi("dobbecktraining@gmail.com")).toBe(true) // default owner
    expect(canUseLibraryAi("alice@example.com")).toBe(true)
    expect(canUseLibraryAi("BOB@example.com")).toBe(true)
    expect(canUseLibraryAi("carol@example.com")).toBe(false)
    expect(canUseLibraryAi(null)).toBe(false)
    process.env.LIBRARY_AI_COACH_EMAILS = ""
    expect(canUseLibraryAi("alice@example.com")).toBe(false)
  } finally {
    process.env.LIBRARY_AI_COACH_EMAILS = saved
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/library-ai.spec.ts -g "owners and the allowlist"`
Expected: FAIL, cannot find module `../lib/library/access`.

- [ ] **Step 3: Write the access helper**

Create `lib/library/access.ts`:

```ts
import { ownerEmails } from "@/lib/plans"

/**
 * Who may use the AI library builder: owner accounts, plus any coach listed in
 * LIBRARY_AI_COACH_EMAILS (comma separated). The list is read on every call so
 * a test can change it. Phase 2 (Pro and Studio) replaces this with a plan check.
 */
export function canUseLibraryAi(email: string | null | undefined): boolean {
  if (!email) return false
  const e = email.trim().toLowerCase()
  const extra = (process.env.LIBRARY_AI_COACH_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return ownerEmails().includes(e) || extra.includes(e)
}
```

- [ ] **Step 4: Add the test coach to the local allowlist**

Append to `.env.local` (not committed):

```
LIBRARY_AI_COACH_EMAILS=playwright-coach@dev.local
```

Restart the Playwright dev server if one is running (`pkill -f "next dev -p 3011"`), because `.env.local` is read at start.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx playwright test tests/library-ai.spec.ts -g "owners and the allowlist"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/library/access.ts tests/library-ai.spec.ts
git commit -m "Library AI: access gate for owners plus an allowlist"
```

---

### Task 2: YouTube helpers (URL parsing, details, search, oEmbed)

**Files:**
- Create: `lib/library/youtube.ts`
- Modify: `app/coach/library/page.tsx:27-45` (delete the local `youTubeId` and import it)
- Test: `tests/library-ai.spec.ts`

**Interfaces:**
- Produces:
  - `youTubeId(url: string | null | undefined): string | null`
  - `type LineRequest = { line: number; raw: string; kind: "link" | "name"; videoId?: string; name?: string }`
  - `parseLines(text: string): { requests: LineRequest[]; dropped: string[] }`
  - `type VideoInfo = { id: string; url: string; title: string; description: string; channel: string; seconds: number | null; thumbnailUrl: string | null }`
  - `class YouTubeError extends Error { code: "NO_KEY" | "QUOTA" | "FAILED" }`
  - `videoDetails(ids: string[], opts?: { key?: string; fetchImpl?: typeof fetch }): Promise<VideoInfo[]>` (missing ids are simply absent from the result)
  - `searchVideos(name: string, opts?: { key?: string; fetchImpl?: typeof fetch }): Promise<VideoInfo[]>` (ranked, at most 5)
  - `rankCandidates(name: string, videos: VideoInfo[]): VideoInfo[]`
  - `oembedInfo(id: string, fetchImpl?: typeof fetch): Promise<VideoInfo | null>`
  - `isoDurationSeconds(iso: string): number | null`

- [ ] **Step 1: Write the failing tests**

Append to `tests/library-ai.spec.ts`:

```ts
import { youTubeId, parseLines, videoDetails, searchVideos, rankCandidates, oembedInfo, isoDurationSeconds, YouTubeError, type VideoInfo } from "../lib/library/youtube"

// ---------- reading links and names ----------

test("lines: links, names, hints, playlists, and duplicates", () => {
  const { requests, dropped } = parseLines(
    [
      "https://youtu.be/dQw4w9WgXcQ",
      "90/90 Hip Lift https://www.youtube.com/watch?v=dQw4w9WgXcQ", // same video again, with a hint
      "https://www.youtube.com/shorts/abcdefghijk",
      "Left AIC Repositioning",
      "https://www.youtube.com/playlist?list=PL123",
      "",
      "x".repeat(201),
    ].join("\n")
  )
  expect(requests).toEqual([
    { line: 1, raw: "https://youtu.be/dQw4w9WgXcQ", kind: "link", videoId: "dQw4w9WgXcQ", name: "90/90 Hip Lift" },
    { line: 3, raw: "https://www.youtube.com/shorts/abcdefghijk", kind: "link", videoId: "abcdefghijk" },
    { line: 4, raw: "Left AIC Repositioning", kind: "name", name: "Left AIC Repositioning" },
  ])
  expect(dropped).toEqual([
    "Line 5 is not a video link (playlists and channels are not supported).",
    "Line 7 is too long (over 200 characters).",
  ])
  expect(youTubeId("https://www.youtube.com/embed/abcdefghijk?rel=0")).toBe("abcdefghijk")
  expect(youTubeId("https://vimeo.com/123")).toBeNull()
  expect(isoDurationSeconds("PT1M5S")).toBe(65)
  expect(isoDurationSeconds("PT2H")).toBe(7200)
  expect(isoDurationSeconds("junk")).toBeNull()
})

test("lines: more than 20 are refused", () => {
  const { requests, dropped } = parseLines(Array.from({ length: 22 }, (_, i) => `Exercise ${i + 1}`).join("\n"))
  expect(requests).toHaveLength(20)
  expect(dropped).toEqual(["Only the first 20 lines were read."])
})

const fakeFetch = (handler: (url: string) => { status?: number; body: unknown }) =>
  (async (input: RequestInfo | URL) => {
    const { status = 200, body } = handler(String(input))
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  }) as typeof fetch

const ytItem = (id: string, title: string, extra: Partial<{ description: string; channel: string; duration: string }> = {}) => ({
  id,
  snippet: { title, description: extra.description ?? "", channelTitle: extra.channel ?? "Chan", thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } } },
  contentDetails: { duration: extra.duration ?? "PT0M45S" },
})

test("videoDetails: reads title, description, channel, length; missing videos are absent; no key and quota are named errors", async () => {
  const fetchImpl = fakeFetch((url) => {
    expect(url).toContain("videos?part=snippet%2CcontentDetails")
    expect(url).toContain("id=aaaaaaaaaaa%2Cbbbbbbbbbbb")
    return { body: { items: [ytItem("aaaaaaaaaaa", "90-90 Hip Lift", { description: "x".repeat(2000), duration: "PT1M5S" })] } }
  })
  const got = await videoDetails(["aaaaaaaaaaa", "bbbbbbbbbbb"], { key: "k", fetchImpl })
  expect(got).toHaveLength(1)
  expect(got[0]).toMatchObject({ id: "aaaaaaaaaaa", url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", title: "90-90 Hip Lift", channel: "Chan", seconds: 65, thumbnailUrl: "https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg" })
  expect(got[0].description).toHaveLength(1500)

  await expect(videoDetails(["aaaaaaaaaaa"], { key: "", fetchImpl })).rejects.toMatchObject({ code: "NO_KEY" })
  const quota = fakeFetch(() => ({ status: 403, body: { error: { errors: [{ reason: "quotaExceeded" }] } } }))
  await expect(videoDetails(["aaaaaaaaaaa"], { key: "k", fetchImpl: quota })).rejects.toMatchObject({ code: "QUOTA" })
  const down = fakeFetch(() => ({ status: 500, body: {} }))
  await expect(videoDetails(["aaaaaaaaaaa"], { key: "k", fetchImpl: down })).rejects.toBeInstanceOf(YouTubeError)
})

test("searchVideos: asks for short videos, then ranks by title words and length", async () => {
  const v = (id: string, title: string, seconds: number): VideoInfo => ({ id, url: `https://www.youtube.com/watch?v=${id}`, title, description: "", channel: "c", seconds, thumbnailUrl: null })
  expect(rankCandidates("Goblet Squat", [v("1", "Leg day vlog", 600), v("2", "Goblet Squat tutorial", 120), v("3", "How to Goblet Squat", 40)]).map((x) => x.id)).toEqual(["3", "2", "1"])

  const fetchImpl = fakeFetch((url) => {
    if (url.includes("/search?")) {
      expect(url).toContain("type=video")
      expect(url).toContain("videoDuration=short")
      expect(url).toContain("q=Goblet+Squat+exercise")
      return { body: { items: [{ id: { videoId: "ccccccccccc" } }, { id: { videoId: "ddddddddddd" } }] } }
    }
    return { body: { items: [ytItem("ccccccccccc", "Leg day vlog", { duration: "PT10M" }), ytItem("ddddddddddd", "Goblet Squat", { duration: "PT0M40S" })] } }
  })
  const got = await searchVideos("Goblet Squat", { key: "k", fetchImpl })
  expect(got.map((x) => x.id)).toEqual(["ddddddddddd", "ccccccccccc"])
})

test("oembedInfo: title and channel without a key; null when the video is gone", async () => {
  const ok = fakeFetch(() => ({ body: { title: "Front Squat", author_name: "Ryan", thumbnail_url: "https://i.ytimg.com/vi/eeeeeeeeeee/hqdefault.jpg" } }))
  expect(await oembedInfo("eeeeeeeeeee", ok)).toMatchObject({ id: "eeeeeeeeeee", title: "Front Squat", channel: "Ryan", description: "", seconds: null, thumbnailUrl: "https://i.ytimg.com/vi/eeeeeeeeeee/hqdefault.jpg" })
  const gone = fakeFetch(() => ({ status: 404, body: {} }))
  expect(await oembedInfo("eeeeeeeeeee", gone)).toBeNull()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/library-ai.spec.ts -g "lines:|videoDetails|searchVideos|oembedInfo"`
Expected: FAIL, cannot find module `../lib/library/youtube`.

- [ ] **Step 3: Write the YouTube helper**

Create `lib/library/youtube.ts`:

```ts
/**
 * Reading YouTube for the AI library builder. Every network call takes a
 * `fetchImpl` so tests never touch the network. The Data API needs
 * YOUTUBE_API_KEY; without it, links still resolve to a title through oEmbed
 * (no key) and name searches are refused.
 */
export type LineRequest = { line: number; raw: string; kind: "link" | "name"; videoId?: string; name?: string }
export type VideoInfo = {
  id: string
  url: string
  title: string
  description: string
  channel: string
  seconds: number | null
  thumbnailUrl: string | null
}

export class YouTubeError extends Error {
  constructor(public code: "NO_KEY" | "QUOTA" | "FAILED", message: string) {
    super(message)
  }
}

export const MAX_LINES = 20
export const MAX_LINE_CHARS = 200
const MAX_DESCRIPTION = 1500
const API = "https://www.googleapis.com/youtube/v3"

/** Strip a YouTube watch / short / shorts / embed URL down to its video id. Null for anything else. */
export function youTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/watch\?[^#\s]*v=([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

const looksLikeUrl = (s: string) => /https?:\/\/\S+/i.test(s)

/**
 * One request per non-empty line. A line holding a YouTube video link is a link
 * request (any other words on the line are the coach's name hint); a line with
 * no link is a name request. Two lines for the same video collapse into one,
 * keeping the first hint seen.
 */
export function parseLines(text: string): { requests: LineRequest[]; dropped: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const requests: LineRequest[] = []
  const dropped: string[] = []
  const seen = new Map<string, LineRequest>()
  let read = 0
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (!raw) continue
    if (read >= MAX_LINES) {
      dropped.push(`Only the first ${MAX_LINES} lines were read.`)
      break
    }
    read++
    const line = i + 1
    if (raw.length > MAX_LINE_CHARS) {
      dropped.push(`Line ${line} is too long (over ${MAX_LINE_CHARS} characters).`)
      continue
    }
    const urlMatch = raw.match(/https?:\/\/\S+/i)
    if (urlMatch) {
      const videoId = youTubeId(urlMatch[0])
      if (!videoId) {
        dropped.push(`Line ${line} is not a video link (playlists and channels are not supported).`)
        continue
      }
      const hint = raw.replace(urlMatch[0], "").replace(/\s+/g, " ").trim()
      const existing = seen.get(videoId)
      if (existing) {
        if (!existing.name && hint) existing.name = hint
        continue
      }
      const req: LineRequest = { line, raw, kind: "link", videoId }
      if (hint) req.name = hint
      seen.set(videoId, req)
      requests.push(req)
      continue
    }
    if (looksLikeUrl(raw)) {
      dropped.push(`Line ${line} is not a video link (playlists and channels are not supported).`)
      continue
    }
    requests.push({ line, raw, kind: "name", name: raw })
  }
  return { requests, dropped }
}

/** "PT1M5S" -> 65. Null when it is not an ISO 8601 duration. */
export function isoDurationSeconds(iso: string): number | null {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!m || (!m[1] && !m[2] && !m[3])) return null
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

type Opts = { key?: string; fetchImpl?: typeof fetch }
const keyOf = (o?: Opts) => (o && "key" in o ? o.key ?? "" : process.env.YOUTUBE_API_KEY ?? "")

async function dataApi(path: string, params: Record<string, string>, opts?: Opts): Promise<any> {
  const key = keyOf(opts)
  if (!key) throw new YouTubeError("NO_KEY", "Set a YouTube API key to search by name.")
  const f = opts?.fetchImpl ?? fetch
  const qs = new URLSearchParams({ ...params, key })
  const res = await f(`${API}/${path}?${qs.toString()}`, { signal: AbortSignal.timeout(15_000) })
  const body = await res.json().catch(() => ({}))
  if (res.status === 403 && JSON.stringify(body).includes("quotaExceeded")) {
    throw new YouTubeError("QUOTA", "YouTube's daily lookup limit is used up; try again after midnight Pacific.")
  }
  if (!res.ok) throw new YouTubeError("FAILED", `YouTube answered ${res.status}.`)
  return body
}

const toInfo = (item: any): VideoInfo => ({
  id: item.id,
  url: `https://www.youtube.com/watch?v=${item.id}`,
  title: String(item.snippet?.title ?? "").trim(),
  description: String(item.snippet?.description ?? "").trim().slice(0, MAX_DESCRIPTION),
  channel: String(item.snippet?.channelTitle ?? "").trim(),
  seconds: typeof item.contentDetails?.duration === "string" ? isoDurationSeconds(item.contentDetails.duration) : null,
  thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
})

/** Title, description, channel, length and thumbnail for up to 50 ids per call. Ids YouTube does not return are left out. */
export async function videoDetails(ids: string[], opts?: Opts): Promise<VideoInfo[]> {
  const out: VideoInfo[] = []
  for (let i = 0; i < ids.length; i += 50) {
    const body = await dataApi("videos", { part: "snippet,contentDetails", id: ids.slice(i, i + 50).join(",") }, opts)
    for (const item of Array.isArray(body.items) ? body.items : []) if (typeof item.id === "string") out.push(toInfo(item))
  }
  return out
}

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean))

/** Best demo first: titles that carry the name's words, then shorter videos, then YouTube's own order. */
export function rankCandidates(name: string, videos: VideoInfo[]): VideoInfo[] {
  const q = Array.from(words(name))
  return videos
    .map((v, i) => {
      const t = words(v.title)
      const hits = q.filter((w) => t.has(w)).length
      return { v, i, cover: q.length ? hits / q.length : 0 }
    })
    .sort((a, b) => b.cover - a.cover || (a.v.seconds ?? 1e9) - (b.v.seconds ?? 1e9) || a.i - b.i)
    .map((x) => x.v)
}

/** Search YouTube for a demo of `name` (100 quota units) and return up to 5 ranked candidates. */
export async function searchVideos(name: string, opts?: Opts): Promise<VideoInfo[]> {
  const body = await dataApi("search", { part: "id", type: "video", videoDuration: "short", maxResults: "5", q: `${name} exercise` }, opts)
  const ids = (Array.isArray(body.items) ? body.items : []).map((i: any) => i?.id?.videoId).filter((x: unknown): x is string => typeof x === "string")
  if (!ids.length) return []
  return rankCandidates(name, await videoDetails(ids, opts))
}

/** Title and channel with no API key. Null when YouTube has no such public video. */
export async function oembedInfo(id: string, fetchImpl: typeof fetch = fetch): Promise<VideoInfo | null> {
  const url = `https://www.youtube.com/watch?v=${id}`
  const res = await fetchImpl(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) return null
  const j = await res.json().catch(() => null)
  if (!j || typeof j.title !== "string") return null
  return { id, url, title: j.title.trim(), description: "", channel: String(j.author_name ?? "").trim(), seconds: null, thumbnailUrl: typeof j.thumbnail_url === "string" ? j.thumbnail_url : null }
}
```

- [ ] **Step 4: Point the library page at the shared `youTubeId`**

In `app/coach/library/page.tsx`, delete the local `youTubeId` function (the block from the comment `// Strip a YouTube watch / short / shorts URL down to its video id.` through its closing `}`) and add the import:

```ts
import { youTubeId } from "@/lib/library/youtube"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx playwright test tests/library-ai.spec.ts -g "lines:|videoDetails|searchVideos|oembedInfo"` then `npx playwright test tests/library.spec.ts -g "opens correct URL"`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/library/youtube.ts app/coach/library/page.tsx tests/library-ai.spec.ts
git commit -m "Library AI: YouTube link parsing, details, search and oEmbed with an injectable fetch"
```

---

### Task 3: Prompt, parser, duplicate check and equipment vocabulary

**Files:**
- Create: `lib/library/propose.ts` (pure: no Prisma import, because the panel component imports its types and `PATTERNS`)
- Create: `lib/library/vocab.ts` (server only: reads the library)
- Create: `lib/ai/chat.ts`
- Test: `tests/library-ai.spec.ts`

**Interfaces:**
- Consumes: `VideoInfo` from Task 2; `noLongDashes` from `lib/text`; `libraryMatcher` from `lib/ai/assist`.
- Produces:
  - `PATTERNS: readonly string[]`
  - `type Duplicate = { id: string; name: string }`
  - `type ProposeItem = { line: number; hint?: string; video: VideoInfo; alternatives: VideoInfo[]; duplicate: Duplicate | null }`
  - `type Alternative = { url: string; title: string; seconds: number | null; thumbnailUrl: string | null }`
  - `type ProposedEntry = { line: number; name: string; videoUrl: string; thumbnailUrl: string | null; patterns: string[]; equipment: string[]; cues: string; summary: string; confidence: "low" | "medium" | "high"; unknownEquipment: boolean; duplicate: Duplicate | null; alternatives: Alternative[] }`
  - `SYSTEM: string`, `renderPrompt(items: ProposeItem[], equipmentVocab: string[]): string`
  - `parseEntries(raw: string, items: ProposeItem[], equipmentVocab: string[]): { entries: ProposedEntry[]; warnings: string[]; dropped: string[] }`
  - `findDuplicate(names: string[], match: (n: string) => string | null, libraryName: (id: string) => string | null, hasVideo: (id: string) => boolean): Duplicate | null`
  - `type SaveEntry = { name: string; videoUrl: string; thumbnailUrl: string | null; patterns: string[]; equipment: string[]; cues: string; summary: string; replaceId?: string }`
  - `validateSaveEntry(input: unknown): { ok: true; value: SaveEntry } | { ok: false; error: string }`
  - `lib/library/vocab.ts`: `equipmentVocab(): Promise<string[]>` (top 30 equipment values, cached 10 minutes)
  - `lib/ai/chat.ts`: `completeJson(opts: { system: string; user: string; maxTokens: number }): Promise<ModelResult>` where `ModelResult` is the type exported by `lib/ai/assist.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/library-ai.spec.ts`:

```ts
import { PATTERNS, renderPrompt, parseEntries, findDuplicate, validateSaveEntry, type ProposeItem } from "../lib/library/propose"

// ---------- the prompt and the model's answer ----------

const vid = (id: string, title: string, description = ""): VideoInfo => ({ id, url: `https://www.youtube.com/watch?v=${id}`, title, description, channel: "Ryan", seconds: 45, thumbnailUrl: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` })
const items: ProposeItem[] = [
  { line: 1, hint: "90/90 Hip Lift", video: vid("aaaaaaaaaaa", "90-90 Hip Lift Demo", "Feet on wall, lift hips an inch."), alternatives: [], duplicate: null },
  { line: 2, video: vid("bbbbbbbbbbb", "Front Squat"), alternatives: [vid("ccccccccccc", "Front Squat (alt)")], duplicate: { id: "lib9", name: "Front Squat" } },
]
const vocab = ["Barbell", "Bodyweight", "Dumbbell"]

test("the prompt carries each video, the coach's hint, the vocabulary and the likely duplicate", () => {
  const p = renderPrompt(items, vocab)
  expect(p).toContain("1  90-90 Hip Lift Demo")
  expect(p).toContain("coach calls it: 90/90 Hip Lift")
  expect(p).toContain("Feet on wall")
  expect(p).toContain("already in the library as: Front Squat")
  expect(p).toContain(PATTERNS.join(", "))
  expect(p).toContain("Barbell, Bodyweight, Dumbbell")
})

test("entries: vocabulary is enforced, bad rows are dropped, unknown lines are ignored", () => {
  const raw = JSON.stringify({
    entries: [
      { line: 1, name: "90-90 Hip Lift — PRI", patterns: ["Core", "Mobility", "Yoga"], equipment: ["Bodyweight", "Wall"], cues: "Exhale fully.", summary: "PRI reset.", confidence: "high" },
      { line: 2, patterns: ["Squat"], equipment: [], cues: "", summary: "" }, // no name: dropped, and does not block the real answer below
      { line: 3, name: "Ghost", patterns: ["Pull"], equipment: [], cues: "", summary: "" },
      { line: 1, name: "Second answer for line 1", patterns: [], equipment: [], cues: "", summary: "" },
      { line: 2, name: "Front Squat", patterns: ["Squat"], equipment: ["Barbell"], cues: "", summary: "", confidence: "nope" },
    ],
    warnings: ["Line 2 might be a vlog"],
  })
  const { entries, warnings, dropped } = parseEntries(raw, items, vocab)
  expect(entries).toHaveLength(2)
  expect(entries[0]).toMatchObject({
    line: 1, name: "90-90 Hip Lift, PRI", videoUrl: "https://www.youtube.com/watch?v=aaaaaaaaaaa", thumbnailUrl: "https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg",
    patterns: ["Core", "Mobility"], equipment: ["Bodyweight", "Wall"], unknownEquipment: true, cues: "Exhale fully.", summary: "PRI reset.", confidence: "high", duplicate: null, alternatives: [],
  })
  expect(entries[1]).toMatchObject({ line: 2, name: "Front Squat", confidence: "medium", duplicate: { id: "lib9", name: "Front Squat" }, unknownEquipment: false })
  expect(entries[1].alternatives).toEqual([{ url: "https://www.youtube.com/watch?v=ccccccccccc", title: "Front Squat (alt)", seconds: 45, thumbnailUrl: "https://i.ytimg.com/vi/ccccccccccc/mqdefault.jpg" }])
  expect(warnings).toEqual(["Line 2 might be a vlog"])
  expect(dropped).toEqual(["The answer for line 2 had no name.", "The model answered for line 3, which was not asked about.", "A second answer for line 1 was ignored."])
})

test("entries: an answer that is not JSON gives no entries and a plain message", () => {
  const { entries, dropped } = parseEntries("Sorry, I cannot do that.", items, vocab)
  expect(entries).toEqual([])
  expect(dropped).toEqual(["The model did not answer in the expected format. Try again."])
})

test("duplicate: the first name that reaches a library entry with a video", () => {
  const match = (n: string) => ({ "front squat": "lib9", "goblet squat": "lib2" })[n.toLowerCase()] ?? null
  const libName = (id: string) => ({ lib9: "Front Squat", lib2: "Goblet Squat" })[id] ?? null
  const hasVideo = (id: string) => id === "lib9"
  expect(findDuplicate(["Front Squat Demo", "Front Squat"], match, libName, hasVideo)).toEqual({ id: "lib9", name: "Front Squat" })
  expect(findDuplicate(["Goblet Squat"], match, libName, hasVideo)).toBeNull() // no video: not a duplicate worth replacing
  expect(findDuplicate(["Nothing"], match, libName, hasVideo)).toBeNull()
})

test("save entries are validated the same way on the way in", () => {
  const good = validateSaveEntry({ name: " Front Squat ", videoUrl: "https://youtu.be/bbbbbbbbbbb", thumbnailUrl: null, patterns: ["Squat", "Nope"], equipment: ["Barbell"], cues: "Elbows up.", summary: "", replaceId: "lib9" })
  expect(good).toEqual({ ok: true, value: { name: "Front Squat", videoUrl: "https://youtu.be/bbbbbbbbbbb", thumbnailUrl: null, patterns: ["Squat"], equipment: ["Barbell"], cues: "Elbows up.", summary: "", replaceId: "lib9" } })
  expect(validateSaveEntry({ name: "", videoUrl: "https://youtu.be/x" })).toMatchObject({ ok: false, error: "An entry had no name." })
  expect(validateSaveEntry({ name: "X", videoUrl: "ftp://nope" })).toMatchObject({ ok: false, error: "X: the video link must start with http." })
  expect(validateSaveEntry({ name: "X", videoUrl: "https://youtu.be/x", thumbnailUrl: "javascript:alert(1)" })).toMatchObject({ ok: true, value: { thumbnailUrl: null } })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/library-ai.spec.ts -g "the prompt|entries:|duplicate:|save entries"`
Expected: FAIL, cannot find module `../lib/library/propose`.

- [ ] **Step 3: Write the chat helper**

Create `lib/ai/chat.ts`:

```ts
import { ASSIST_MODEL, type ModelResult } from "@/lib/ai/assist"

// $ per million tokens, used only when OpenRouter does not report a cost.
const PRICE: Record<string, [number, number]> = { "anthropic/claude-sonnet-5": [2, 10] }
const FALLBACK_PRICE: [number, number] = [10, 50]

/**
 * One system + user turn through OpenRouter on our key, for tools that want a
 * JSON answer (the caller parses it). Same model, pricing and timeout as Ask AI.
 */
export async function completeJson(opts: { system: string; user: string; maxTokens: number }): Promise<ModelResult> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error("The AI assistant is not configured (no OpenRouter key).")
  const model = ASSIST_MODEL()
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens,
      usage: { include: true },
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
    signal: AbortSignal.timeout(110_000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`The AI service returned ${res.status}. Try again in a moment.`)
  const j = JSON.parse(text)
  const tokensIn = j.usage?.prompt_tokens ?? 0
  const tokensOut = j.usage?.completion_tokens ?? 0
  const [pin, pout] = PRICE[model] ?? FALLBACK_PRICE
  const costUsd = typeof j.usage?.cost === "number" ? j.usage.cost : (tokensIn * pin + tokensOut * pout) / 1e6
  return { content: j.choices?.[0]?.message?.content ?? "", costUsd, tokensIn, tokensOut, model, finish: j.choices?.[0]?.finish_reason ?? "" }
}
```

- [ ] **Step 4: Write the propose module**

Create `lib/library/propose.ts`:

```ts
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

```

Create `lib/library/vocab.ts` (server only):

```ts
import { prisma } from "@/lib/prisma"

let vocabCache: { at: number; list: string[] } | null = null
/** The 30 most used equipment words in the library, so the model tags with the words the filters use. */
export async function equipmentVocab(): Promise<string[]> {
  if (vocabCache && Date.now() - vocabCache.at < 10 * 60_000) return vocabCache.list
  const rows = await prisma.exerciseLibrary.findMany({ select: { equipment: true } })
  const counts = new Map<string, number>()
  for (const r of rows) for (const e of r.equipment) if (e.trim()) counts.set(e.trim(), (counts.get(e.trim()) ?? 0) + 1)
  const list = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 30)
    .map(([e]) => e)
  vocabCache = { at: Date.now(), list }
  return list
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx playwright test tests/library-ai.spec.ts -g "the prompt|entries:|duplicate:|save entries"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/library/propose.ts lib/library/vocab.ts lib/ai/chat.ts tests/library-ai.spec.ts
git commit -m "Library AI: prompt, strict parser, duplicate check and save validation"
```

---

### Task 4: The save route

**Files:**
- Create: `app/api/library/ai/save/route.ts`
- Test: `tests/library-ai.spec.ts`

**Interfaces:**
- Consumes: `canUseLibraryAi` (Task 1), `validateSaveEntry`, `SaveEntry` (Task 3), `invalidateLibraryMatcher` from `lib/ai/assist`, `ownerEmails` from `lib/plans`.
- Produces: `POST /api/library/ai/save` body `{ entries: unknown[] }` → `{ saved: { id: string; name: string }[]; failed: { name: string; error: string }[] }`. 401 when not allowed, 400 when `entries` is missing, empty or over 20.

- [ ] **Step 1: Write the failing tests**

Append to `tests/library-ai.spec.ts`:

```ts
// ---------- saving ----------

async function signInAs(browser: import("@playwright/test").Browser, email: string, password: string) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/coach|\/client/, { timeout: 15_000 })
  return { ctx, page }
}

/** A coach who is neither an owner nor on the allowlist. Idempotent, so any test can call it first. */
const STRANGER = { email: "playwright-libai-stranger@dev.local", password: "stranger-PW-1" }
async function ensureStranger() {
  return prisma.user.upsert({
    where: { email: STRANGER.email },
    update: {},
    create: { email: STRANGER.email, name: "Stranger Coach", role: "COACH", hashedPassword: await bcrypt.hash(STRANGER.password, 10), coachProfile: { create: {} } },
  })
}

test("save: creates entries with video and tags, replaces only the video on a duplicate, reports bad rows, and the matcher sees the result", async ({ page }) => {
  const existing = await prisma.exerciseLibrary.create({
    data: { name: `${PREFIX}Existing Front Squat`, category: "Custom", difficulty: "Any", videoUrl: "https://example.com/old.mp4", isCustom: true, createdBy: coachId, instructions: "Keep this", muscleGroups: ["Squat"], equipment: ["Barbell"] },
  })
  const res = await page.request.post("/api/library/ai/save", {
    data: {
      entries: [
        { name: `${PREFIX}Hip Lift`, videoUrl: "https://youtu.be/aaaaaaaaaaa", thumbnailUrl: "https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg", patterns: ["Core", "Mobility"], equipment: ["Bodyweight"], cues: "Exhale fully.", summary: "PRI reset." },
        { name: `${PREFIX}Existing Front Squat`, videoUrl: "https://youtu.be/bbbbbbbbbbb", thumbnailUrl: null, patterns: ["Squat"], equipment: ["Barbell"], cues: "ignored on replace", summary: "", replaceId: existing.id },
        { name: `${PREFIX}Gone`, videoUrl: "https://youtu.be/ccccccccccc", patterns: [], equipment: [], cues: "", summary: "", replaceId: "does-not-exist" },
        { name: "", videoUrl: "https://youtu.be/ddddddddddd" },
      ],
    },
  })
  expect(res.ok()).toBe(true)
  const out = await res.json()
  expect(out.saved.map((s: { name: string }) => s.name)).toEqual([`${PREFIX}Hip Lift`, `${PREFIX}Existing Front Squat`])
  expect(out.failed).toEqual([
    { name: `${PREFIX}Gone`, error: "That library entry no longer exists." },
    { name: "", error: "An entry had no name." },
  ])

  const made = await prisma.exerciseLibrary.findFirstOrThrow({ where: { name: `${PREFIX}Hip Lift` } })
  expect(made).toMatchObject({ category: "Custom", difficulty: "Any", muscleGroups: ["Core", "Mobility"], equipment: ["Bodyweight"], instructions: "Exhale fully.", description: "PRI reset.", videoUrl: "https://youtu.be/aaaaaaaaaaa", thumbnailUrl: "https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg", isCustom: true, createdBy: coachId, locked: true })
  const replaced = await prisma.exerciseLibrary.findUniqueOrThrow({ where: { id: existing.id } })
  expect(replaced).toMatchObject({ videoUrl: "https://youtu.be/bbbbbbbbbbb", thumbnailUrl: null, locked: true, instructions: "Keep this", muscleGroups: ["Squat"] })

  // The new entry links through Ask AI's matcher right away (the cache was cleared).
  const { libraryMatcher } = await import("../lib/ai/assist")
  const match = await libraryMatcher()
  expect(match(`${PREFIX}Hip Lift`)).toBe(made.id)
})

test("save: refuses a coach who is not allowed, and empty or oversized batches", async ({ page, browser }) => {
  await ensureStranger()
  const { ctx, page: sp } = await signInAs(browser, STRANGER.email, STRANGER.password)
  const denied = await sp.request.post("/api/library/ai/save", { data: { entries: [{ name: "X", videoUrl: "https://youtu.be/x" }] } })
  expect(denied.status()).toBe(401)
  await ctx.close()

  expect((await page.request.post("/api/library/ai/save", { data: { entries: [] } })).status()).toBe(400)
  expect((await page.request.post("/api/library/ai/save", { data: { entries: Array.from({ length: 21 }, () => ({ name: "X", videoUrl: "https://youtu.be/x" })) } })).status()).toBe(400)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/library-ai.spec.ts -g "save:"`
Expected: FAIL with 404 responses (route does not exist).

- [ ] **Step 3: Write the route**

Create `app/api/library/ai/save/route.ts`:

```ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { invalidateLibraryMatcher } from "@/lib/ai/assist"
import { withAlert } from "@/lib/alert"
import { canUseLibraryAi } from "@/lib/library/access"
import { validateSaveEntry } from "@/lib/library/propose"
import { ownerEmails } from "@/lib/plans"
import { prisma } from "@/lib/prisma"

const MAX_ENTRIES = 20

/**
 * Save the entries the coach ticked in the AI library panel.
 * Body: { entries: [{ name, videoUrl, thumbnailUrl, patterns, equipment, cues, summary, replaceId? }] }
 * Each entry is validated again here. One bad entry fails on its own; the rest save.
 */
async function handlePOST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH" || !canUseLibraryAi(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const isOwner = !!session.user.email && ownerEmails().includes(session.user.email.toLowerCase())
  const body = (await req.json().catch(() => ({}))) as { entries?: unknown[] }
  if (!Array.isArray(body.entries) || !body.entries.length || body.entries.length > MAX_ENTRIES) {
    return NextResponse.json({ error: `Send 1 to ${MAX_ENTRIES} entries.` }, { status: 400 })
  }

  const saved: { id: string; name: string }[] = []
  const failed: { name: string; error: string }[] = []
  for (const input of body.entries) {
    const v = validateSaveEntry(input)
    if (!v.ok) {
      failed.push({ name: typeof (input as { name?: unknown })?.name === "string" ? ((input as { name: string }).name) : "", error: v.error })
      continue
    }
    const e = v.value
    try {
      if (e.replaceId) {
        const existing = await prisma.exerciseLibrary.findUnique({ where: { id: e.replaceId }, select: { id: true, createdBy: true } })
        if (!existing) {
          failed.push({ name: e.name, error: "That library entry no longer exists." })
          continue
        }
        if (!isOwner && existing.createdBy !== session.user.id) {
          failed.push({ name: e.name, error: "You can only replace the video on exercises you added." })
          continue
        }
        const row = await prisma.exerciseLibrary.update({
          where: { id: existing.id },
          data: { videoUrl: e.videoUrl, thumbnailUrl: e.thumbnailUrl, locked: true },
          select: { id: true, name: true },
        })
        saved.push(row)
      } else {
        const row = await prisma.exerciseLibrary.create({
          data: {
            name: e.name,
            category: "Custom",
            difficulty: "Any",
            muscleGroups: e.patterns,
            equipment: e.equipment,
            instructions: e.cues || null,
            description: e.summary || null,
            videoUrl: e.videoUrl,
            thumbnailUrl: e.thumbnailUrl,
            isCustom: true,
            createdBy: session.user.id,
            locked: true,
          },
          select: { id: true, name: true },
        })
        saved.push(row)
      }
    } catch {
      failed.push({ name: e.name, error: "Could not save this one. Try again." })
    }
  }
  if (saved.length) invalidateLibraryMatcher()
  return NextResponse.json({ saved, failed })
}

export const POST = withAlert("library/ai/save", handlePOST)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/library-ai.spec.ts -g "save:"`
Expected: PASS. If the matcher assertion fails because the test process has its own module cache, that is expected: the test calls `libraryMatcher()` in the test process, which has never cached anything, so it reads fresh. If it still fails, check the entry's `videoUrl` is set (the matcher sorts video-backed rows first but matches any row by name).

- [ ] **Step 5: Commit**

```bash
git add app/api/library/ai/save/route.ts tests/library-ai.spec.ts
git commit -m "Library AI: save route writes reviewed entries and replaces duplicate videos"
```

---

### Task 5: Shared funding decision, then the propose route

**Files:**
- Create: `lib/ai/funding.ts`
- Modify: `app/api/ai/assist/route.ts:27-54` (use the shared decision)
- Modify: `lib/ai-billing.ts:85` (`kind` union), `lib/ai/spend.ts:60` (`kind` union)
- Create: `app/api/library/ai/propose/route.ts`
- Test: `tests/library-ai.spec.ts`; existing `tests/ai-assist.spec.ts` must still pass

**Interfaces:**
- Consumes: Tasks 1 to 3; `assertUnderCap`, `AiCapError`, `spendMeter` from `lib/ai/spend`; `ASSIST_MIN_CENTS`, `settleAiCall` from `lib/ai-billing`; `getCoachPlan` from `lib/plans`; `libraryMatcher` from `lib/ai/assist`; `completeJson` from `lib/ai/chat`.
- Produces:
  - `lib/ai/funding.ts`: `decideAssistFunding(coachId: string): Promise<{ mode: "allowance" | "balance" } | { deny: { error: string; code: string } }>`
  - `POST /api/library/ai/propose` body `{ text: string }` → `{ entries: ProposedEntry[]; warnings: string[]; dropped: string[]; meter: SpendMeter }`; 401 not allowed; 400 empty text; 402 funding with Ask AI's `code`; 503 with `{ error }` when YouTube's key is missing for name lines or quota is out.

- [ ] **Step 1: Write the failing tests**

Append to `tests/library-ai.spec.ts`:

```ts
// ---------- proposing (gates only: no test calls YouTube or a model) ----------

test("propose: refuses a coach who is not allowed, empty text, and a used-up cap before any fetch", async ({ page, browser }) => {
  await ensureStranger()
  const { ctx, page: sp } = await signInAs(browser, STRANGER.email, STRANGER.password)
  expect((await sp.request.post("/api/library/ai/propose", { data: { text: "https://youtu.be/aaaaaaaaaaa" } })).status()).toBe(401)
  await ctx.close()

  expect((await page.request.post("/api/library/ai/propose", { data: { text: "   " } })).status()).toBe(400)

  await prisma.aiUsage.deleteMany({ where: { coachId } })
  await prisma.aiUsage.create({ data: { coachId, kind: "assist", model: "test", costUsd: 26 } })
  try {
    const res = await page.request.post("/api/library/ai/propose", { data: { text: "https://youtu.be/aaaaaaaaaaa" } })
    expect(res.status()).toBe(402)
    expect((await res.json()).code).toBe("AI_CAP")
    expect(await prisma.aiUsage.count({ where: { coachId } })).toBe(1)
  } finally {
    await prisma.aiUsage.deleteMany({ where: { coachId, kind: "assist", model: "test" } })
  }
})

test("propose: only playlist lines means nothing to look up, answered without a model call", async ({ page }) => {
  const res = await page.request.post("/api/library/ai/propose", { data: { text: "https://www.youtube.com/playlist?list=PL1" } })
  expect(res.ok()).toBe(true)
  const out = await res.json()
  expect(out.entries).toEqual([])
  expect(out.dropped[0]).toContain("not a video link")
  expect(await prisma.aiUsage.count({ where: { coachId, kind: { in: ["library", "library_paid"] } } })).toBe(0)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/library-ai.spec.ts -g "propose:"`
Expected: FAIL with 404 (route does not exist).

- [ ] **Step 3: Extract the funding decision**

Create `lib/ai/funding.ts`:

```ts
import { AiCapError, assertUnderCap } from "@/lib/ai/spend"
import { ASSIST_MIN_CENTS } from "@/lib/ai-billing"
import { getCoachPlan } from "@/lib/plans"
import { prisma } from "@/lib/prisma"

/**
 * Who pays for a small AI call (Ask AI, the library builder). Included on
 * plans with the assistant up to the monthly cap; otherwise, or past the cap,
 * it comes out of the coach's AI balance. Nothing left: a 402 with a reason.
 */
export async function decideAssistFunding(coachId: string): Promise<{ mode: "allowance" | "balance" } | { deny: { error: string; code: string } }> {
  const [{ plan }, profile] = await Promise.all([
    getCoachPlan(coachId),
    prisma.coachProfile.findUnique({ where: { userId: coachId }, select: { aiBalanceCents: true } }),
  ])
  const balance = profile?.aiBalanceCents ?? 0
  if (plan.assistant) {
    try {
      await assertUnderCap(coachId)
      return { mode: "allowance" }
    } catch (e) {
      if (!(e instanceof AiCapError)) throw e
      if (balance < ASSIST_MIN_CENTS) return { deny: { error: e.message, code: e.code } }
    }
  }
  if (balance < ASSIST_MIN_CENTS) {
    return { deny: { error: "The AI assistant comes with Pro and Studio. Or add AI balance in Settings, Plan & billing and pay a few cents a message.", code: "AI_FUNDS" } }
  }
  return { mode: "balance" }
}
```

In `app/api/ai/assist/route.ts`, replace the block from `// Included on Pro and Studio up to the monthly cap` through the second `return NextResponse.json(... status: 402 ...)` (lines 27 to 44 as of today) with:

```ts
  const funding = await decideAssistFunding(coachId)
  if ("deny" in funding) {
    return NextResponse.json({ error: forClient(funding.deny.error), code: funding.deny.code, meter: await spendMeter(coachId) }, { status: 402 })
  }
  const mode = funding.mode
```

and change its imports: remove `AiCapError, assertUnderCap` from the `@/lib/ai/spend` import (keep `spendMeter`), remove `getCoachPlan` and `ASSIST_MIN_CENTS` imports, and add `import { decideAssistFunding } from "@/lib/ai/funding"`. `prisma` stays imported (still used lower down? If not, remove it too; `npx tsc --noEmit` will say).

In `lib/ai-billing.ts` line 85 change the call type to `kind: "generate" | "assist" | "library"`. In `lib/ai/spend.ts` line 60 change to `kind: "assist" | "generate" | "library" | "assist_paid" | "generate_paid" | "library_paid"`.

- [ ] **Step 4: Run the Ask AI suite to prove the extraction changed nothing**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v scripts/coach-kit; npx playwright test tests/ai-assist.spec.ts`
Expected: no type errors outside `scripts/coach-kit`; all Ask AI tests pass (the cap and funds 402 tests cover the moved code).

- [ ] **Step 5: Write the propose route**

Create `app/api/library/ai/propose/route.ts`:

```ts
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
    if (links.length && hasKey) for (const v of await videoDetails(links.map((l) => l.videoId!))) found.set(v.id, v)
    else for (const l of links) {
      const v = await oembedInfo(l.videoId!)
      if (v) found.set(v.id, v)
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
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx playwright test tests/library-ai.spec.ts -g "propose:"`
Expected: PASS. The playlist-only test must return 200 with no model call: confirm `AiUsage` count stays 0.

- [ ] **Step 7: Commit**

```bash
git add lib/ai/funding.ts app/api/ai/assist/route.ts lib/ai-billing.ts lib/ai/spend.ts app/api/library/ai/propose/route.ts tests/library-ai.spec.ts
git commit -m "Library AI: propose route reads YouTube, checks duplicates, asks the model once; funding decision shared with Ask AI"
```

---

### Task 6: The review panel

**Files:**
- Create: `components/coach/LibraryAiPanel.tsx`
- Modify: `app/coach/library/page.tsx` (render the panel button beside "New exercise", only for allowed coaches)
- Test: `tests/library-ai.spec.ts`

**Interfaces:**
- Consumes: `ProposedEntry`, `PATTERNS` from Task 3; routes from Tasks 4 and 5; `canUseLibraryAi` from Task 1.
- Produces: `LibraryAiPanel({ meter }: { meter: { spent: number; cap: number; level: "ok" | "warn" | "capped" } })` default export.

- [ ] **Step 1: Write the failing test**

Append to `tests/library-ai.spec.ts`:

```ts
// ---------- the panel ----------

test("in the panel: propose (mocked), edit a name, untick a low-confidence row, save for real, see the card", async ({ page }) => {
  const name = `${PREFIX}Panel Hip Lift`
  await page.route("**/api/library/ai/propose", async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    await route.fulfill({
      json: {
        entries: [
          { line: 1, name: "90-90 Hip Lift", videoUrl: "https://youtu.be/aaaaaaaaaaa", thumbnailUrl: "https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg", patterns: ["Core", "Mobility"], equipment: ["Bodyweight"], cues: "Exhale fully.", summary: "PRI reset.", confidence: "high", unknownEquipment: false, duplicate: null, alternatives: [] },
          { line: 2, name: "Leg Day Vlog", videoUrl: "https://youtu.be/bbbbbbbbbbb", thumbnailUrl: null, patterns: ["Squat"], equipment: ["Barbell"], cues: "", summary: "", confidence: "low", unknownEquipment: false, duplicate: null, alternatives: [] },
        ],
        warnings: ["Line 2 looks like a vlog, not a demo."],
        dropped: ["Line 3 is not a video link (playlists and channels are not supported)."],
        meter: { spent: 0.5, cap: 25, level: "ok" },
      },
    })
  })

  await page.goto("/coach/library")
  await page.getByRole("button", { name: "Add with AI" }).click()
  const panel = page.getByRole("dialog", { name: "Add exercises with AI" })
  await expect(panel).toBeVisible()
  await panel.getByRole("textbox", { name: "Links or names" }).fill("https://youtu.be/aaaaaaaaaaa\nhttps://youtu.be/bbbbbbbbbbb\nhttps://www.youtube.com/playlist?list=PL1")
  await panel.getByRole("button", { name: "Propose" }).click()

  await expect(panel.getByText("Worth a look")).toBeVisible()
  await expect(panel.getByText(/Left out:/)).toContainText("not a video link")
  const rows = panel.locator("[data-entry]")
  await expect(rows).toHaveCount(2)
  // The confident row starts ticked, the low-confidence one unticked.
  await expect(rows.nth(0).getByRole("checkbox")).toBeChecked()
  await expect(rows.nth(1).getByRole("checkbox")).not.toBeChecked()
  await expect(rows.nth(1).getByText("Low confidence")).toBeVisible()
  await expect(panel.getByRole("button", { name: "Save 1 exercise" })).toBeVisible()

  // Edit the name and drop a pattern before saving.
  await rows.nth(0).getByRole("textbox", { name: "Name" }).fill(name)
  await rows.nth(0).getByRole("button", { name: "Mobility" }).click() // toggles the chip off
  await panel.getByRole("button", { name: "Save 1 exercise" }).click()

  await page.waitForURL(/\/coach\/library\?q=/)
  const card = page.locator(".grid > [data-card]", { hasText: name })
  await expect(card).toBeVisible()
  await expect(card.locator("img")).toHaveAttribute("src", /aaaaaaaaaaa/)
  const row = await prisma.exerciseLibrary.findFirstOrThrow({ where: { name } })
  expect(row.muscleGroups).toEqual(["Core"])
  expect(row.instructions).toBe("Exhale fully.")
  expect(await prisma.exerciseLibrary.count({ where: { name: "Leg Day Vlog" } })).toBe(0)
})

test("in the panel: a coach who is not allowed sees no button", async ({ browser }) => {
  await ensureStranger()
  const { ctx, page: sp } = await signInAs(browser, STRANGER.email, STRANGER.password)
  await sp.goto("/coach/library")
  await expect(sp.getByRole("heading", { name: "Exercise Library" })).toBeVisible()
  await expect(sp.getByRole("button", { name: "Add with AI" })).toHaveCount(0)
  await ctx.close()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/library-ai.spec.ts -g "in the panel"`
Expected: FAIL, no button named "Add with AI".

- [ ] **Step 3: Write the panel component**

Create `components/coach/LibraryAiPanel.tsx`:

```tsx
"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { PATTERNS, type ProposedEntry } from "@/lib/library/propose"

type Meter = { spent: number; cap: number; level: "ok" | "warn" | "capped" }
type Row = ProposedEntry & { picked: boolean; replace: boolean; error?: string }

const money = (n: number) => `$${n.toFixed(2)}`
const length = (s: number | null) => (s == null ? "" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`)
const INPUT = "w-full rounded border border-[#ddd7cc] bg-[#faf8f4] px-2 py-1.5 text-sm text-[#16181d]"

/**
 * "Add with AI" on the library page: paste YouTube links or exercise names,
 * review the proposed entries, edit anything inline, save the ticked ones.
 * The proposal lives only in this component's state.
 */
export default function LibraryAiPanel({ meter: initial }: { meter: Meter }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState<"" | "reading" | "saving">("")
  const [rows, setRows] = useState<Row[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [dropped, setDropped] = useState<string[]>([])
  const [meter, setMeter] = useState(initial)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const patch = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)))

  const propose = async () => {
    if (!text.trim() || busy) return
    setBusy("reading")
    setRows([])
    const res = await fetch("/api/library/ai/propose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => null)
    setBusy("")
    const d = res ? await res.json().catch(() => ({})) : {}
    if (d.meter) setMeter(d.meter)
    if (!res?.ok) return toast.error(d.error ?? "Could not reach the AI. Try again.")
    setRows((d.entries as ProposedEntry[]).map((e) => ({ ...e, picked: e.confidence !== "low", replace: !!e.duplicate })))
    setWarnings(d.warnings ?? [])
    setDropped(d.dropped ?? [])
    if (!d.entries?.length) toast.message("Nothing to propose from those lines.")
  }

  const save = async () => {
    const chosen = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.picked)
    if (!chosen.length || busy) return
    setBusy("saving")
    const res = await fetch("/api/library/ai/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: chosen.map(({ r }) => ({
          name: r.name, videoUrl: r.videoUrl, thumbnailUrl: r.thumbnailUrl, patterns: r.patterns, equipment: r.equipment, cues: r.cues, summary: r.summary,
          ...(r.replace && r.duplicate ? { replaceId: r.duplicate.id } : {}),
        })),
      }),
    }).catch(() => null)
    setBusy("")
    const d = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) return toast.error(d.error ?? "Could not save. Try again.")
    const failed = new Map<string, string>((d.failed ?? []).map((f: { name: string; error: string }) => [f.name, f.error]))
    const n = (d.saved ?? []).length
    if (n) toast.success(`Saved ${n} ${n === 1 ? "exercise" : "exercises"} to your library`)
    if (failed.size) {
      // Failed rows stay with their reason; saved rows leave the list.
      setRows((cur) => cur.filter((r) => !r.picked || failed.has(r.name)).map((r) => (failed.has(r.name) ? { ...r, error: failed.get(r.name) } : r)))
      return
    }
    setRows([])
    setText("")
    setOpen(false)
    const first = d.saved?.[0]?.name
    if (first) router.push(`/coach/library?q=${encodeURIComponent(first)}`)
    router.refresh()
  }

  const picked = rows.filter((r) => r.picked).length
  const pct = Math.min(100, (meter.spent / meter.cap) * 100)
  const bar = meter.level === "capped" ? "bg-[#c1272d]" : meter.level === "warn" ? "bg-[#c88c3c]" : "bg-[#3e8e5a]"

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded border border-[#16181d] px-4 py-2 text-sm font-medium text-[#16181d] hover:bg-[#f4f2ed]">
        <span aria-hidden>&#10022;</span> Add with AI
      </button>

      {open && (
        <div className="fixed inset-0 z-40 sm:inset-auto sm:bottom-5 sm:right-5 sm:top-5" role="dialog" aria-label="Add exercises with AI">
          <div className="flex h-full w-full flex-col overflow-hidden bg-[#f4f2ed] shadow-2xl sm:w-[32rem] sm:rounded-2xl sm:border sm:border-[#e0dad0]">
            <div className="border-b border-[#e0dad0] bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-display text-xl font-bold leading-none text-[#16181d]">Add with AI</p>
                  <p className="text-xs text-[#6b6257]">One YouTube link or exercise name per line. You review every entry before it is saved.</p>
                </div>
                <button onClick={() => setOpen(false)} className="rounded-full px-3 py-1 text-sm font-semibold text-[#6b6257]" aria-label="Close">
                  Close
                </button>
              </div>
              <div className="mt-2" title="Resets on the 1st">
                <div className="flex justify-between text-[11px] text-[#6b6257]">
                  <span>AI spend this month</span>
                  <span className="font-semibold tabular-nums">
                    {money(meter.spent)} of ${meter.cap.toFixed(0)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#e7e2d9]">
                  <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                aria-label="Links or names"
                placeholder={"https://youtu.be/...\n90/90 Hip Lift https://youtu.be/...\nGoblet Squat"}
                disabled={!!busy || meter.level === "capped"}
                className={`${INPUT} min-h-[6rem]`}
              />
              <button
                type="button"
                onClick={() => void propose()}
                disabled={!!busy || !text.trim() || meter.level === "capped"}
                className="rounded-xl bg-[#16181d] px-4 py-2 font-display text-base font-bold uppercase tracking-[0.06em] text-[#f4f1ea] disabled:opacity-40"
              >
                Propose
              </button>
              {busy === "reading" && <p className="animate-pulse text-sm text-[#6b6257]">Reading the videos, then thinking&hellip;</p>}

              {rows.map((r, i) => (
                <div key={`${r.line}-${r.videoUrl}`} data-entry className={`rounded-2xl border bg-white p-3 ${r.picked ? "border-[#e0dad0]" : "border-[#eee9e0] opacity-80"}`}>
                  <div className="flex gap-3">
                    <input type="checkbox" checked={r.picked} onChange={(e) => patch(i, { picked: e.target.checked })} disabled={!!busy} className="mt-1 h-4 w-4 shrink-0 accent-[#c1272d]" aria-label={`Save ${r.name}`} />
                    <a href={r.videoUrl} target="_blank" rel="noopener noreferrer" className="block w-24 shrink-0 overflow-hidden rounded bg-[#e7e2d9]" aria-label="Open the video">
                      {r.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.thumbnailUrl} alt="" className="aspect-video w-full object-cover" />
                      ) : (
                        <div className="aspect-video w-full" />
                      )}
                    </a>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <input value={r.name} onChange={(e) => patch(i, { name: e.target.value })} aria-label="Name" className={`${INPUT} font-semibold`} />
                      <p className="text-[11px] text-[#857c70]">
                        Line {r.line}
                        {r.confidence === "low" && <span className="ml-1.5 rounded bg-[#fbf0dc] px-1.5 py-0.5 font-semibold text-[#7a4f08]">Low confidence</span>}
                        {r.unknownEquipment && <span className="ml-1.5 rounded bg-[#f1ede5] px-1.5 py-0.5 font-semibold text-[#6b6257]">New equipment word</span>}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {PATTERNS.map((p) => {
                      const on = r.patterns.includes(p)
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => patch(i, { patterns: on ? r.patterns.filter((x) => x !== p) : [...r.patterns, p].slice(-2) })}
                          aria-pressed={on}
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${on ? "bg-[#16181d] text-[#f4f1ea]" : "bg-[#f1ede5] text-[#6b6257]"}`}
                        >
                          {p}
                        </button>
                      )
                    })}
                  </div>
                  <input
                    value={r.equipment.join(", ")}
                    onChange={(e) => patch(i, { equipment: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4) })}
                    aria-label="Equipment"
                    placeholder="Equipment, comma separated"
                    className={`${INPUT} mt-2`}
                  />
                  <textarea value={r.cues} onChange={(e) => patch(i, { cues: e.target.value })} aria-label="Cues" rows={2} placeholder="Cues" className={`${INPUT} mt-2`} />

                  {r.duplicate && (
                    <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-[#4a443c]">
                      <input type="checkbox" checked={r.replace} onChange={(e) => patch(i, { replace: e.target.checked })} className="h-3.5 w-3.5 accent-[#c1272d]" />
                      Looks like <span className="font-semibold">{r.duplicate.name}</span> (has a video). Replace that entry&apos;s video instead of adding a new one.
                    </label>
                  )}
                  {r.alternatives.length > 0 && (
                    <div className="mt-2 text-xs text-[#4a443c]">
                      Other videos found:{" "}
                      {r.alternatives.map((a) => (
                        <button
                          key={a.url}
                          type="button"
                          onClick={() => patch(i, { videoUrl: a.url, thumbnailUrl: a.thumbnailUrl, alternatives: [{ url: r.videoUrl, title: r.name, seconds: null, thumbnailUrl: r.thumbnailUrl }, ...r.alternatives.filter((x) => x.url !== a.url)] })}
                          className="mr-2 underline"
                        >
                          {a.title} {length(a.seconds)}
                        </button>
                      ))}
                    </div>
                  )}
                  {r.error && <p className="mt-2 text-xs text-[#a3262b]">{r.error}</p>}
                </div>
              ))}

              {warnings.length > 0 && (
                <div className="rounded-xl bg-[#fbf0dc] px-3 py-2 text-xs text-[#7a4f08]">
                  <p className="font-semibold">Worth a look</p>
                  <ul className="mt-0.5 list-disc pl-4">
                    {warnings.map((w, k) => (
                      <li key={k}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {dropped.length > 0 && <p className="px-1 text-xs text-[#857c70]">Left out: {dropped.join(" ")}</p>}
            </div>

            {rows.length > 0 && (
              <div className="border-t border-[#e0dad0] bg-white p-3">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!picked || !!busy}
                  className="pulse-cta w-full rounded-xl bg-[#c1272d] px-3 py-2.5 font-display text-base font-bold uppercase tracking-[0.06em] text-white disabled:opacity-50"
                >
                  {busy === "saving" ? "Saving…" : `Save ${picked} ${picked === 1 ? "exercise" : "exercises"}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 4: Put the button on the library page**

In `app/coach/library/page.tsx`:

Add imports:

```ts
import LibraryAiPanel from "@/components/coach/LibraryAiPanel"
import { canUseLibraryAi } from "@/lib/library/access"
import { spendMeter } from "@/lib/ai/spend"
```

Just after the `isOwner` line add:

```ts
  const aiAllowed = canUseLibraryAi(session.user.email)
  const meter = aiAllowed ? await spendMeter(session.user.id) : null
```

Replace `<AddExerciseButton />` with:

```tsx
          <div className="flex flex-wrap items-center gap-2">
            {aiAllowed && meter && <LibraryAiPanel meter={meter} />}
            <AddExerciseButton />
          </div>
```

- [ ] **Step 5: Run the tests**

Run: `npx playwright test tests/library-ai.spec.ts tests/library.spec.ts`
Expected: all PASS. If the "Save 1 exercise" button is not found, check that the low-confidence row really starts unticked (`picked: e.confidence !== "low"`).

- [ ] **Step 6: Type check, lint, commit**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v scripts/coach-kit; npx eslint lib/library lib/ai/chat.ts lib/ai/funding.ts app/api/library app/coach/library components/coach/LibraryAiPanel.tsx`
Expected: no output from tsc; eslint exit 0.

```bash
git add components/coach/LibraryAiPanel.tsx app/coach/library/page.tsx tests/library-ai.spec.ts
git commit -m "Library AI: review panel on the library page for allowed coaches"
```

---

### Task 7: Ship

**Files:**
- Modify: Vercel project `coachrx-app` environment (no files)
- Modify: `/Users/macbook/.claude/projects/-Users-macbook/memory/project_wod_coach_app.md` (one line)

- [ ] **Step 1: Run every suite this touched**

Run: `npx playwright test tests/library-ai.spec.ts tests/library.spec.ts tests/ai-assist.spec.ts tests/exercise-search.spec.ts`
Expected: all PASS. One known flake: an Ask AI undo test occasionally answers 500 on the shared preview database; rerun that test alone before treating it as a failure.

- [ ] **Step 2: Add the YouTube key to Vercel when Ryan has it**

Ryan creates the key in Google Cloud (enable "YouTube Data API v3", create an API key, restrict it to that API). Then:

```bash
npx vercel env add YOUTUBE_API_KEY production
```

paste the key when asked. Also add it to `.env.local` as `YOUTUBE_API_KEY=...` for local use. Without the key the feature still deploys: links read titles through oEmbed and name lines are refused with a plain message.

- [ ] **Step 3: Merge and push**

```bash
git checkout master && git fetch && git pull --ff-only
git merge --no-ff feat/library-ai -m "Merge feat/library-ai: add exercises from YouTube links with AI-filled entries"
git push origin master
```

Then wait about two minutes and confirm the newest row is `● Ready`:

```bash
npx vercel ls coachrx-app 2>&1 | grep -m1 vercel.app
```

- [ ] **Step 4: Try it for real once**

Signed in as the owner on wod.coach, open `/coach/library`, click "Add with AI", paste one YouTube link of a movement not yet in the library, Propose, check the tags, Save. Then open a client's Ask AI and send "add video for <that exercise>" to see the `link` row appear.

- [ ] **Step 5: Record it in memory**

Add one line under the wod.coach project memory (`project_wod_coach_app.md`) above the `**2026-10-11 Library video editing LIVE` entry: the feature name, the commit, `LIBRARY_AI_COACH_EMAILS` and `YOUTUBE_API_KEY` env names, and that phase 2 (Pro/Studio) needs private coach entries first.
