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
