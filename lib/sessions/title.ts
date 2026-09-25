/**
 * Reading the coach's own calendar habit. A session title carries the package
 * count ("Personal Training 1HR Geetika 5/10") and sometimes a flag
 * ("_needspayment"). "_/10" means a count that has not been filled in yet.
 */
export type TitleInfo = {
  index: number | null // the 5 in "5/10"; null when missing or "_"
  size: number | null // the 10; null when the title has no count at all
  needsPayment: boolean
  looksLikeSession: boolean
}

// n/N where N is a plausible package size, never a time ("6:00") or money ("$1/2").
const COUNT = /(?<![\d:.$\/])(\d{1,2}|_)\s*\/\s*(\d{1,2})(?!\d|\/)/g
const NEEDS_PAYMENT = /needs?\s*-?\s*payment|payment\s*due|unpaid|not\s+paid/i
const SESSIONISH = /personal training|workout|\b\d+\s*(?:hr|hour|min)s?\b|off-?site|\bsession\b|\bPT\b/i
// Things on a busy calendar that share words with a session but are not one.
const NOT_A_SESSION = /crossfit|\bbike\b|hybrid hour|foundations|climbing|showing|delivery|deliveries|consultation/i

export function parseTitle(title: string): TitleInfo {
  let index: number | null = null
  let size: number | null = null
  for (const m of Array.from(title.matchAll(COUNT))) {
    const n = m[1] === "_" ? null : Number(m[1])
    const total = Number(m[2])
    if (total < 2 || total > 60) continue
    if (n !== null && (n < 1 || n > total)) continue
    index = n
    size = total
    break
  }
  return {
    index,
    size,
    needsPayment: NEEDS_PAYMENT.test(title),
    looksLikeSession: SESSIONISH.test(title) && !NOT_A_SESSION.test(title),
  }
}
