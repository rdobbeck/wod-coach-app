import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { alertRyan, withAlert } from "@/lib/alert"
import { MAX_SHOTS } from "@/lib/bug-reports-shared"

/**
 * A client reports a problem from inside the app.
 *
 * Screenshots were already uploaded straight to the private bucket via
 * /api/uploads/sign; only their paths arrive here, and only paths under this
 * client's own folder are accepted, so nobody can attach someone else's file.
 */
async function handlePOST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "CLIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as {
    body?: string
    path?: string
    userAgent?: string
    viewport?: string
    installed?: boolean
    screenshots?: string[]
  }
  const body = (b.body ?? "").trim().slice(0, 4000)
  const screenshots = Array.isArray(b.screenshots)
    ? b.screenshots.filter((p) => typeof p === "string" && p.startsWith(`${session.user.id}/`)).slice(0, MAX_SHOTS)
    : []
  if (!body && !screenshots.length) return NextResponse.json({ error: "Tell us what happened or add a screenshot" }, { status: 400 })

  const report = await prisma.bugReport.create({
    data: {
      userId: session.user.id,
      body,
      path: typeof b.path === "string" ? b.path.slice(0, 200) : null,
      userAgent: typeof b.userAgent === "string" ? b.userAgent.slice(0, 300) : null,
      viewport: typeof b.viewport === "string" ? b.viewport.slice(0, 20) : null,
      installed: b.installed === true,
      screenshots,
    },
    select: { id: true },
  })

  const who = session.user.name ?? session.user.email ?? "A client"
  const first = body.split(/\n/)[0] || "(screenshot only)"
  const shots = screenshots.length ? ` · ${screenshots.length} screenshot${screenshots.length > 1 ? "s" : ""}` : ""
  await alertRyan(`WOD Coach: ${who} reported a problem`, `${b.path ?? "?"}${shots}\n${first.slice(0, 200)}\nwod.coach/coach/bugs`)
  return NextResponse.json({ ok: true, id: report.id })
}

/** The coach marks a report handled (or reopens it). */
async function handlePATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, resolved } = (await req.json().catch(() => ({}))) as { id?: string; resolved?: boolean }
  if (!id || typeof resolved !== "boolean") return NextResponse.json({ error: "Missing id or resolved" }, { status: 400 })
  const { count } = await prisma.bugReport.updateMany({
    where: { id, user: { coaches: { some: { coachId: session.user.id } } } },
    data: { resolvedAt: resolved ? new Date() : null },
  })
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export const POST = withAlert("bug-reports", handlePOST)
export const PATCH = withAlert("bug-reports", handlePATCH)
