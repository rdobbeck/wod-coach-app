import { NextResponse, type NextRequest } from "next/server"

/**
 * Coach links. <slug>.wod.coach shows that coach's page (app/c/[slug]).
 * Any other path on a coach subdomain goes to the main domain, where
 * sign-in and the app live, so sessions only ever exist on one host.
 */
const DOMAIN = process.env.NEXT_PUBLIC_BRAND_DOMAIN || "wod.coach"
const NOT_COACHES = new Set(["www", "app"])

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase()
  if (!host.endsWith(`.${DOMAIN}`)) return NextResponse.next()

  const sub = host.slice(0, -(DOMAIN.length + 1))
  if (!sub || sub.includes(".") || NOT_COACHES.has(sub)) return NextResponse.next()

  const { pathname, search } = req.nextUrl
  if (pathname === "/") return NextResponse.rewrite(new URL(`/c/${sub}`, req.url))

  return NextResponse.redirect(`https://${DOMAIN}${pathname}${search}`, 307)
}

// Static assets and API calls pass straight through (the coach page needs its JS/CSS).
export const config = {
  matcher: ["/((?!_next/|api/|favicon|icon|apple-icon|manifest|sw\\.js|.*\\.(?:png|jpg|jpeg|svg|webp|ico|js|css|txt|xml|json)$).*)"],
}
