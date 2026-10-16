import { createHmac, timingSafeEqual } from "crypto"

/**
 * Signed links for the .ics download. iOS fetches a calendar file in a separate
 * system browser with none of the app's cookies, so the link itself has to say
 * whose sessions these are. Server only (uses the auth secret).
 */
const DAYS = 7
const secret = () => {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error("NEXTAUTH_SECRET is not set")
  return s
}
const sign = (userId: string, ids: string[], exp: number) =>
  createHmac("sha256", secret()).update(`plan-ics|${userId}|${ids.join(",")}|${exp}`).digest("base64url")

/** Path + query for the user's planned sessions, valid for a week. */
export function planIcsPath(userId: string, ids: string[], now = Date.now()) {
  const exp = Math.floor(now / 1000) + DAYS * 86_400
  const q = new URLSearchParams({ ids: ids.join(","), u: userId, exp: String(exp), sig: sign(userId, ids, exp) })
  return `/api/plan/ics?${q}`
}

/** The user the link was signed for, or null if it was altered or has expired. */
export function verifyPlanIcs(q: URLSearchParams, now = Date.now()): { userId: string; ids: string[] } | null {
  const userId = q.get("u")
  const ids = (q.get("ids") ?? "").split(",").filter(Boolean)
  const exp = Number(q.get("exp"))
  const sig = q.get("sig") ?? ""
  if (!userId || !ids.length || !Number.isFinite(exp) || exp * 1000 < now) return null
  const want = Buffer.from(sign(userId, ids, exp))
  const got = Buffer.from(sig)
  return want.length === got.length && timingSafeEqual(want, got) ? { userId, ids } : null
}
