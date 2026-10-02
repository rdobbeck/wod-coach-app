import { test, expect } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { randomBytes } from "node:crypto"
import { dbUrl } from "../lib/db-url"

/**
 * A past client who redeems an invite is back: their link to the coach goes
 * ACTIVE again, so the app shows their history instead of an empty screen.
 */
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })
const CLIENT_EMAIL = "playwright-client@dev.local"
const PASSWORD = "playwright-test-PW-1"
let clientId = ""

test.beforeAll(async () => {
  clientId = (await prisma.user.findUniqueOrThrow({ where: { email: CLIENT_EMAIL } })).id
})

test.afterAll(async () => {
  await prisma.clientCoach.updateMany({ where: { clientId }, data: { status: "ACTIVE" } })
  await prisma.$disconnect()
})

test("redeeming an invite reactivates an inactive client", async ({ request }) => {
  await prisma.clientCoach.updateMany({ where: { clientId }, data: { status: "INACTIVE" } })
  const token = randomBytes(24).toString("base64url")
  await prisma.verificationToken.create({
    data: { identifier: `invite:${clientId}`, token, expires: new Date(Date.now() + 86_400_000) },
  })

  const res = await request.post("/api/auth/invite", { data: { token, password: PASSWORD } })
  expect(res.ok()).toBe(true)

  const links = await prisma.clientCoach.findMany({ where: { clientId } })
  expect(links.length).toBeGreaterThan(0)
  expect(links.every((l) => l.status === "ACTIVE")).toBe(true)
})
