import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { dbUrl } from "../lib/db-url"
import { canUseLibraryAi } from "../lib/library/access"
import { libraryMatcher } from "../lib/ai/assist"

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
