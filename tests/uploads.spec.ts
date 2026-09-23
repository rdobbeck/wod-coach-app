import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { dbUrl } from "../lib/db-url"
import { removeUploads } from "../lib/uploads"

/**
 * The form-check loop: a client attaches a video to a session, the coach sees
 * it and replies. Files go straight to private storage and are only ever shown
 * through a signed URL.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })

let workoutId = ""
let clientId = ""
const written: string[] = []

// A tiny but real mp4, so the browser treats it as a video rather than a blob.
const MP4_BASE64 =
  "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAr1tZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzA5NSBiYWVlNDAwIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYw=="

test.beforeAll(async () => {
  const client = await prisma.user.findUniqueOrThrow({ where: { email: "playwright-client@dev.local" } })
  clientId = client.id
  await prisma.workout.deleteMany({ where: { clientId, name: "Upload Session" } })
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z")
  const w = await prisma.workout.create({
    data: {
      clientId,
      name: "Upload Session",
      scheduledDate: today,
      dayOfWeek: today.getUTCDay(),
      order: 1,
      exercises: { create: [{ name: "Snatch", prescription: "5 x 2", order: 1 }] },
    },
  })
  workoutId = w.id
})

test.afterAll(async () => {
  await removeUploads(written)
  await prisma.workout.deleteMany({ where: { clientId, name: "Upload Session" } })
  await prisma.$disconnect()
})

async function signInAsClient(page: Page) {
  await page.goto("/auth/signin")
  await page.locator('input[name="email"]').fill("playwright-client@dev.local")
  await page.locator('input[name="password"]').fill("playwright-test-PW-1")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/client$/, { timeout: 15_000 })
}

test("a client attaches a video and the coach can watch it", async ({ browser, page }) => {
  test.setTimeout(90_000)
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const clientPage = await ctx.newPage()
  await signInAsClient(clientPage)
  await clientPage.goto(`/client/workouts/${workoutId}`)

  await clientPage.getByPlaceholder("Ask your coach about this session").fill("Third rep felt off, can you look?")
  await clientPage.setInputFiles('input[type="file"]', {
    name: "snatch.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from(MP4_BASE64, "base64"),
  })

  // The thumbnail shows before sending, and can be removed again.
  await expect(clientPage.getByRole("button", { name: "Remove" })).toBeVisible()

  const send = clientPage.getByRole("button", { name: /^Send|^Sending/ })
  await expect(send).toBeEnabled()
  await send.click()

  await expect(clientPage.getByRole("paragraph").filter({ hasText: "Third rep felt off" })).toBeVisible({ timeout: 20_000 })
  await expect(clientPage.getByRole("button", { name: "Play video" })).toBeVisible()

  // It really landed in storage, under this client's own folder.
  const saved = await prisma.attachment.findMany({
    where: { comment: { workoutId } },
    select: { path: true, mime: true, sizeBytes: true },
  })
  written.push(...saved.map((a) => a.path))
  expect(saved).toHaveLength(1)
  expect(saved[0].mime).toBe("video/mp4")
  expect(saved[0].path.startsWith(`${clientId}/`)).toBe(true)
  expect(saved[0].sizeBytes).toBeGreaterThan(0)

  // It survives a reload, which means it is being signed on read, not cached.
  await clientPage.reload()
  await expect(clientPage.getByRole("button", { name: "Play video" })).toBeVisible()

  // The coach sees the same video on their view of the session.
  await page.goto(`/coach/clients/${clientId}/workouts/${workoutId}`)
  await expect(page.getByRole("button", { name: "Play video" })).toBeVisible()
  await page.getByRole("button", { name: "Play video" }).click()
  await expect(page.getByRole("button", { name: "✕ Close" })).toBeVisible()

  await ctx.close()
})

test("a client cannot attach a file from someone else's folder", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signInAsClient(page)

  const res = await page.request.post(`/api/workouts/${workoutId}/comments`, {
    data: { body: "", attachments: [{ path: "someone-else/stolen.mp4", mime: "video/mp4", size: 1234 }] },
  })
  // The forged path is dropped, which leaves nothing to post.
  expect(res.status()).toBe(400)
  await ctx.close()
})

test("unsupported types and oversized files are refused at the signing step", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await signInAsClient(page)

  const bad = await page.request.post("/api/uploads/sign", { data: { mime: "application/pdf", size: 100 } })
  expect(bad.status()).toBe(400)

  const huge = await page.request.post("/api/uploads/sign", { data: { mime: "video/mp4", size: 60 * 1024 * 1024 } })
  expect(huge.status()).toBe(400)

  const good = await page.request.post("/api/uploads/sign", { data: { mime: "video/mp4", size: 1024 } })
  expect(good.ok()).toBe(true)
  const { path } = (await good.json()) as { path: string }
  expect(path.startsWith(`${clientId}/`)).toBe(true)

  await ctx.close()
})
