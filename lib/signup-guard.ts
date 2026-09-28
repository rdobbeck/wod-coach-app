import { createHash } from "node:crypto"
import { prisma } from "@/lib/prisma"

/**
 * Cheap bot checks for the email + password signup. Google sign-in doesn't go
 * through here. Three checks, none of which a real person notices:
 *   - a hidden "website" field that only form-filling bots fill in
 *   - the form must have been open for MIN_MS before it's sent
 *   - at most MAX_PER_HOUR signups per connection (salted IP hash, not the IP)
 */
export const HONEYPOT_FIELD = "website"
const MIN_MS = 2_000
const MAX_PER_HOUR = 5
const HOUR = 3_600_000

const ipOf = (req: Request) =>
  (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown"

const hashIp = (ip: string) =>
  createHash("sha256")
    .update(`${process.env.NEXTAUTH_SECRET ?? ""}:signup:${ip}`)
    .digest("hex")
    .slice(0, 32)

/** null when the signup may go ahead, otherwise what to tell the person. */
export async function signupProblem(req: Request, body: Record<string, unknown>, now = Date.now()): Promise<string | null> {
  if (typeof body[HONEYPOT_FIELD] === "string" && body[HONEYPOT_FIELD]) return "We couldn't create that account."

  const started = Number(body.startedAt)
  if (!Number.isFinite(started) || now - started < MIN_MS || started > now + 60_000) {
    return "That was quicker than we expected. Wait a moment and try again."
  }

  const ipHash = hashIp(ipOf(req))
  const recent = await prisma.signupAttempt.count({ where: { ipHash, createdAt: { gte: new Date(now - HOUR) } } })
  if (recent >= MAX_PER_HOUR) return "Too many new accounts from this connection. Try again in an hour."

  await prisma.signupAttempt.create({ data: { ipHash } })
  // Keep the table small; old rows are no use to the limit.
  if (Math.random() < 0.05) await prisma.signupAttempt.deleteMany({ where: { createdAt: { lt: new Date(now - 24 * HOUR) } } }).catch(() => {})
  return null
}
