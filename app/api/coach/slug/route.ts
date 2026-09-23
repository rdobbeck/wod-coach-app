import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { checkSlug } from "@/lib/coach-slug-db"

/** Availability check for the signup form and settings: GET ?slug=ryan */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("slug") ?? ""
  const session = await getServerSession(authOptions)
  const r = await checkSlug(raw, session?.user.id)
  return NextResponse.json(r)
}
