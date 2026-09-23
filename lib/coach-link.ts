/**
 * Coach links: every coach gets <slug>.wod.coach, picked at signup.
 * The subdomain's home page is their branded page (app/c/[slug]); everything
 * else redirects to the main domain, where sign-in lives.
 */
export const BRAND_DOMAIN = process.env.NEXT_PUBLIC_BRAND_DOMAIN || "wod.coach"

// Names a coach can't take: our own hosts, and words that would confuse people.
const RESERVED = new Set([
  "app", "www", "api", "admin", "auth", "mail", "email", "smtp", "help", "support", "docs", "blog",
  "status", "dev", "preview", "staging", "demo", "test", "coach", "coaches", "client", "clients",
  "login", "signin", "signup", "account", "billing", "pay", "static", "assets", "cdn", "c",
])

export function normalizeSlug(raw: string) {
  return raw.toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
}

/** Error message for a bad slug, or null when it's usable (uniqueness is checked separately). */
export function slugProblem(slug: string): string | null {
  if (slug.length < 3) return "At least 3 characters"
  if (slug.length > 30) return "30 characters max"
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) return "Letters, numbers and dashes only"
  if (RESERVED.has(slug)) return "That one's reserved"
  return null
}

/** First name is the usual pick: "Ryan Dobbeck" -> "ryan". */
export function suggestSlug(name: string) {
  return normalizeSlug(name.split(/\s+/)[0] ?? "")
}

export const coachLinkHost = (slug: string) => `${slug}.${BRAND_DOMAIN}`
export const coachLinkUrl = (slug: string) => `https://${coachLinkHost(slug)}`

/** True once the app itself is served from the brand domain (NEXTAUTH_URL points there). */
export const brandDomainLive = () => (process.env.NEXTAUTH_URL ?? "").includes(`//${BRAND_DOMAIN}`)
