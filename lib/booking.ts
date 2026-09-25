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
