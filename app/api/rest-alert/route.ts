import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { waitUntil } from "@vercel/functions"
import { authOptions } from "@/lib/auth"
import { withAlert } from "@/lib/alert"
import { prisma } from "@/lib/prisma"
import { canAccessClient } from "@/lib/training"
import { armRestAlert, disarmRestAlert, nextHop, runRestAlertHop } from "@/lib/rest-alert"

/**
 * Arm (POST) or disarm (DELETE) the "Rest's up" push for the signed-in user.
 * The page calls POST when it goes to the background mid-rest and DELETE when
 * it comes back or the rest ends on screen. Body: { workoutId, exercise, endsAt }.
 */
async function handlePOST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { workoutId?: unknown; exercise?: unknown; endsAt?: unknown } | null
  const workoutId = typeof body?.workoutId === "string" ? body.workoutId : null
  const exercise = typeof body?.exercise === "string" && body.exercise.trim() ? body.exercise.trim() : "your next set"
  const endsAt = typeof body?.endsAt === "number" && Number.isFinite(body.endsAt) ? body.endsAt : null
  if (!workoutId || endsAt === null) return NextResponse.json({ error: "Bad request" }, { status: 400 })
  if (endsAt <= Date.now()) {
    await disarmRestAlert(session.user.id)
    return NextResponse.json({ ok: true, armed: false })
  }
  const workout = await prisma.workout.findUnique({ where: { id: workoutId }, select: { clientId: true } })
  if (!workout?.clientId || !(await canAccessClient(session.user.id, workout.clientId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const nonce = await armRestAlert(session.user.id, { workoutId, exercise, endsAt })
  waitUntil(runRestAlertHop(session.user.id, nonce, nextHop(req)))
  return NextResponse.json({ ok: true, armed: true }, { status: 202 })
}

async function handleDELETE() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  await disarmRestAlert(session.user.id)
  return NextResponse.json({ ok: true })
}

export const POST = withAlert("rest-alert", handlePOST)
export const DELETE = withAlert("rest-alert", handleDELETE)
export const dynamic = "force-dynamic"
// One hop sleeps at most HOP_MS (50 s); 60 s is the ceiling Vercel allows on every plan.
export const maxDuration = 60
