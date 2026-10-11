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

// A web address, with or without a scheme, or anything that names a YouTube host.
const URL_RE = /https?:\/\/\S+|(?:^|\s)(?:[\w-]+\.)*(?:youtube\.com|youtu\.be)\/\S*/i
const looksLikeUrl = (s: string) => URL_RE.test(s)

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
    const urlMatch = raw.match(URL_RE)
    if (urlMatch) {
      const videoId = youTubeId(urlMatch[0].trim())
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
