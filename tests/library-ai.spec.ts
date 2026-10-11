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
