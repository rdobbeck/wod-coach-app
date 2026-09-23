import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { notifyUser } from "@/lib/notify"
import { ALLOWED_MIME, MAX_BYTES, signDownloads } from "@/lib/uploads"

/** Post a comment on a workout. Allowed for the client it belongs to and for their coach. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const workout = await prisma.workout.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, clientId: true },
  })
  if (!workout?.clientId) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const mine = workout.clientId === session.user.id
  let coaching = false
  if (!mine && session.user.role === "COACH") {
    coaching = !!(await prisma.clientCoach.findUnique({
      where: { clientId_coachId: { clientId: workout.clientId, coachId: session.user.id } },
    }))
  }
  if (!mine && !coaching) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { body, attachments } = (await req.json()) as {
    body?: string
    attachments?: { path?: string; mime?: string; size?: number }[]
  }
  const text = body?.trim() ?? ""
  if (text.length > 4000) return NextResponse.json({ error: "That's too long" }, { status: 400 })

  // Keep only files this person just uploaded into their own folder, so a path
  // cannot be pointed at somebody else's video.
  const files = (attachments ?? [])
    .filter(
      (a): a is { path: string; mime: string; size: number } =>
        !!a.path &&
        a.path.startsWith(`${session.user.id}/`) &&
        !!a.mime &&
        (ALLOWED_MIME as readonly string[]).includes(a.mime) &&
        typeof a.size === "number" &&
        Number.isFinite(a.size) &&
        a.size > 0 &&
        a.size <= MAX_BYTES
    )
    .slice(0, 4)

  if (!text && !files.length) return NextResponse.json({ error: "Write something first" }, { status: 400 })

  const authorName = session.user.name ?? session.user.email ?? "Someone"
  const comment = await prisma.workoutComment.create({
    data: {
      workoutId: workout.id,
      authorId: session.user.id,
      authorName,
      body: text,
      attachments: {
        create: files.map((f) => ({
          uploaderId: session.user.id,
          path: f.path,
          mime: f.mime,
          sizeBytes: Math.round(f.size),
        })),
      },
    },
    include: { attachments: true },
  })

  // Tell the other side. A client's comment reaches every coach they work with.
  if (coaching) {
    await notifyUser(workout.clientId, {
      title: `${authorName} commented`,
      body: text.slice(0, 120) || (files.length === 1 ? "Sent an attachment" : `Sent ${files.length} attachments`),
      url: `/client/workouts/${workout.id}`,
      tag: `workout-${workout.id}`,
    })
  } else {
    const coaches = await prisma.clientCoach.findMany({
      where: { clientId: workout.clientId, status: "ACTIVE" },
      select: { coachId: true },
    })
    await Promise.all(
      coaches.map((c) =>
        notifyUser(c.coachId, {
          title: `${authorName} commented`,
          body: `${workout.name}: ${text.slice(0, 100) || (files.length ? "sent a video to review" : "")}`,
          url: `/coach/clients/${workout.clientId}/workouts/${workout.id}`,
          tag: `workout-${workout.id}`,
        })
      )
    )
  }

  const urls = await signDownloads(comment.attachments.map((a) => a.path))
  return NextResponse.json({
    comment: {
      id: comment.id,
      author: authorName,
      body: comment.body,
      at: comment.createdAt.toISOString(),
      attachments: comment.attachments.map((a) => ({ id: a.id, mime: a.mime, url: urls[a.path] ?? null })),
    },
  })
}
