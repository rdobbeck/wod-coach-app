import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "./prisma"

/**
 * One-click test login ("Continue as test coach / test client").
 *
 * Enabled only for `next dev` and Vercel preview deploys (which sit behind
 * Vercel's deployment protection). Always off on production, so the live
 * site never registers the provider and the sign-in page never shows it.
 */
export function isDevLoginEnabled() {
  if (process.env.VERCEL_ENV === "production") return false
  return process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview"
}

const DEMO_COACH = { email: "demo-coach@dev.local", name: "Demo Coach" }
const DEMO_CLIENT = { email: "demo-client@dev.local", name: "Demo Client" }

async function ensureDemoUsers() {
  const coach = await prisma.user.upsert({
    where: { email: DEMO_COACH.email },
    update: {},
    create: { ...DEMO_COACH, role: "COACH", coachProfile: { create: {} } },
  })
  const client = await prisma.user.upsert({
    where: { email: DEMO_CLIENT.email },
    update: {},
    create: { ...DEMO_CLIENT, role: "CLIENT", clientProfile: { create: {} } },
  })
  // Link them so the client dashboard has a coach and the coach has a client.
  await prisma.clientCoach.upsert({
    where: { clientId_coachId: { clientId: client.id, coachId: coach.id } },
    update: {},
    create: { clientId: client.id, coachId: coach.id },
  })
  return { coach, client }
}

export const devLoginProvider = CredentialsProvider({
  id: "dev-login",
  name: "Test login",
  credentials: { role: { label: "Role", type: "text" } },
  async authorize(credentials) {
    if (!isDevLoginEnabled()) return null
    const { coach, client } = await ensureDemoUsers()
    if (credentials?.role === "COACH") return coach
    if (credentials?.role === "CLIENT") return client
    return null
  },
})
