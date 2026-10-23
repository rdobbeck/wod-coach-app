import { NextResponse } from "next/server"
import { withAlert } from "@/lib/alert"
import { autoCompleteLoggedSessions } from "@/lib/auto-complete"

/**
 * Each morning (vercel.json), sessions from earlier days that have logged work
 * but were never finished are marked complete (lib/auto-complete.ts). Vercel
 * sends `Authorization: Bearer $CRON_SECRET`, same as the bug-report digest.
 */
async function handleGET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { completed } = await autoCompleteLoggedSessions()
  return NextResponse.json({ ok: true, completed: completed.length })
}

export const GET = withAlert("cron/auto-complete", handleGET)
export const dynamic = "force-dynamic"
