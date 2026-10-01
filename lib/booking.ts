/**
 * A coach's booking link, turned into something safe to put in an iframe.
 *
 * Cal.com and Calendly both serve an embeddable variant of a booking page, so
 * clients can pick a time without leaving the app. Anything else is only ever
 * opened in a new tab.
 */
export type Booking = { url: string; embedUrl: string | null }

export function bookingFor(raw: string | null | undefined): Booking | null {
  const value = raw?.trim()
  if (!value) return null

  let url: URL
  try {
    url = new URL(value.startsWith("http") ? value : `https://${value}`)
  } catch {
    return null
  }
  if (url.protocol !== "https:") return null

  const host = url.hostname.replace(/^www\./, "")
  let embedUrl: string | null = null

  if (host === "cal.com" || host.endsWith(".cal.com")) {
    // Not <path>/embed: that route is the inner half of Cal's embed.js handshake and
    // stays visibility:hidden until a parent script signals it, so a bare iframe
    // renders blank. The normal page with ?embed=true renders standalone.
    const embed = new URL(url.toString())
    embed.pathname = url.pathname.replace(/\/+$/, "").replace(/\/embed$/, "")
    embed.searchParams.set("embed", "true")
    embed.searchParams.set("layout", "month_view")
    embedUrl = embed.toString()
  } else if (host === "calendly.com") {
    const embed = new URL(url.toString())
    embed.searchParams.set("embed_domain", "app.ryandobbeck.com")
    embed.searchParams.set("embed_type", "Inline")
    embedUrl = embed.toString()
  }

  return { url: url.toString(), embedUrl }
}

/** The event slug at the end of a booking link: "gym-pod" for cal.com/you/gym-pod. */
export function bookingSlug(raw: string | null | undefined): string | null {
  const b = bookingFor(raw)
  if (!b) return null
  const parts = new URL(b.url).pathname.replace(/\/+$/, "").replace(/\/embed$/, "").split("/").filter(Boolean)
  return parts.length ? parts[parts.length - 1].toLowerCase() : null
}

/**
 * A phone number as E.164 digits ("+17734917926"), or null if it isn't one.
 * Only North American numbers are assumed when no country code is given.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/[^\d]/g, "")
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`
  if (digits.length >= 11 && digits.length <= 15 && (raw ?? "").trim().startsWith("+")) return `+${digits}`
  return null
}

/** Opens the phone's messaging app with the coach's number (and a first line) filled in. */
export function smsHref(phone: string | null | undefined, body?: string): string | null {
  const n = normalizePhone(phone)
  if (!n) return null
  // "?&body=" is the form both iOS and Android honour.
  return body ? `sms:${n}?&body=${encodeURIComponent(body)}` : `sms:${n}`
}

/** "(773) 491-7926" for a stored +1 number; other countries show as stored. */
export function formatPhone(stored: string | null | undefined): string {
  if (!stored) return ""
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(stored)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : stored
}
