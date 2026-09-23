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
    // Cal.com serves the embed at <path>/embed.
    const path = url.pathname.replace(/\/+$/, "")
    if (path && !path.endsWith("/embed")) {
      const embed = new URL(url.toString())
      embed.pathname = `${path}/embed`
      embed.searchParams.set("layout", "mobile")
      embedUrl = embed.toString()
    } else {
      embedUrl = url.toString()
    }
  } else if (host === "calendly.com") {
    const embed = new URL(url.toString())
    embed.searchParams.set("embed_domain", "app.ryandobbeck.com")
    embed.searchParams.set("embed_type", "Inline")
    embedUrl = embed.toString()
  }

  return { url: url.toString(), embedUrl }
}
