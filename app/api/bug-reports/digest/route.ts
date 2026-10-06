import { NextResponse } from "next/server"
import { alertRyan, withAlert } from "@/lib/alert"
import { digestText, openBugReports } from "@/lib/bug-reports"

/**
 * The daily check-in on reported problems. Vercel's cron calls this each
 * morning (vercel.json); if any report is still unresolved, Ryan's phone gets
 * one push listing them. Nothing open, nothing sent.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when that env var is set,
 * which is what keeps strangers from making the phone buzz.
 */
async function handleGET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const open = await openBugReports()
  const text = digestText(open)
  if (text) await alertRyan(`WOD Coach: ${open.length} problem report${open.length > 1 ? "s" : ""} still open`, text)
  return NextResponse.json({ ok: true, open: open.length })
}

export const GET = withAlert("bug-reports/digest", handleGET)
export const dynamic = "force-dynamic"
