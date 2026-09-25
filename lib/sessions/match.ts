/**
 * Which client is a calendar event for? In order of how much to trust it:
 *   1. a guest on the event whose email is a client's (or an alias email)
 *   2. an alias the coach set up ("murray" means this client)
 *   3. a client's name in the title: the full name, or a first name that only
 *      one client has (two Erics is a guess, so nobody is picked)
 * More than one client can match: that is a tandem session.
 */
export type ClientRef = { id: string; name: string | null; email: string | null }
export type AliasRef = { clientId: string; alias: string }
export type Match = { clientIds: string[]; by: "email" | "alias" | "name" | null }

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const hasWord = (haystack: string, needle: string) => needle.length > 0 && new RegExp(`(^|[^a-z0-9])${escapeRe(needle)}([^a-z0-9]|$)`).test(haystack)

export function matchEvent(ev: { title: string; attendees: string[] }, clients: ClientRef[], aliases: AliasRef[]): Match {
  const title = plain(ev.title)

  // 1. guests
  const byEmail = new Set<string>()
  const emails = new Map<string, string>()
  for (const c of clients) if (c.email) emails.set(c.email.toLowerCase(), c.id)
  for (const a of aliases) if (a.alias.includes("@")) emails.set(a.alias, a.clientId)
  for (const g of ev.attendees) {
    const id = emails.get(g.toLowerCase())
    if (id) byEmail.add(id)
  }
  if (byEmail.size) return { clientIds: Array.from(byEmail), by: "email" }

  // 2. aliases
  const byAlias = new Set<string>()
  for (const a of aliases) if (!a.alias.includes("@") && hasWord(title, plain(a.alias))) byAlias.add(a.clientId)
  if (byAlias.size) return { clientIds: Array.from(byAlias), by: "alias" }

  // 3. names
  const firstCount = new Map<string, number>()
  for (const c of clients) {
    const first = plain((c.name ?? "").trim().split(/\s+/)[0] ?? "")
    if (first) firstCount.set(first, (firstCount.get(first) ?? 0) + 1)
  }
  const byName = new Set<string>()
  for (const c of clients) {
    const full = plain((c.name ?? "").trim().replace(/\s+/g, " "))
    if (!full) continue
    const first = full.split(" ")[0]
    if (full.includes(" ") && hasWord(title, full)) byName.add(c.id)
    else if (first.length >= 3 && firstCount.get(first) === 1 && hasWord(title, first)) byName.add(c.id)
  }
  if (byName.size) return { clientIds: Array.from(byName), by: "name" }
  return { clientIds: [], by: null }
}
