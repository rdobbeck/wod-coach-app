import { NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { withAlert } from "@/lib/alert"
import { nextHop, runRestAlertHop } from "@/lib/rest-alert"

/**
 * The next link in a rest-alert chain, called by the previous one with the
 * CRON_SECRET, same as the cron routes.
 */
async function handlePOST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const body = (await req.json().catch(() => null)) as { userId?: unknown; nonce?: unknown } | null
  if (typeof body?.userId !== "string" || typeof body?.nonce !== "string") return NextResponse.json({ error: "Bad request" }, { status: 400 })
  waitUntil(runRestAlertHop(body.userId, body.nonce, nextHop(req)))
  return NextResponse.json({ ok: true }, { status: 202 })
}

export const POST = withAlert("rest-alert/hop", handlePOST)
export const dynamic = "force-dynamic"
export const maxDuration = 60
