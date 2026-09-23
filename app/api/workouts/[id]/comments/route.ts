import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { notifyUser } from "@/lib/notify"

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

  const { body } = (await req.json()) as { body?: string }
  const text = body?.trim()
  if (!text) return NextResponse.json({ error: "Write something first" }, { status: 400 })
  if (text.length > 4000) return NextResponse.json({ error: "That's too long" }, { status: 400 })

  const authorName = session.user.name ?? session.user.email ?? "Someone"
  const comment = await prisma.workoutComment.create({
    data: { workoutId: workout.id, authorId: session.user.id, authorName, body: text },
  })

  // Tell the other side. A client's comment reaches every coach they work with.
  if (coaching) {
    await notifyUser(workout.clientId, {
      title: `${authorName} commented`,
      body: text.slice(0, 120),
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
          body: `${workout.name}: ${text.slice(0, 100)}`,
          url: `/coach/clients/${workout.clientId}/workouts/${workout.id}`,
          tag: `workout-${workout.id}`,
        })
      )
    )
  }

  return NextResponse.json({
    comment: { id: comment.id, author: authorName, body: comment.body, at: comment.createdAt.toISOString() },
  })
}
