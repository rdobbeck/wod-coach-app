import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const {
      senderId,
      receiverId,
      loomVideoId,
      loomShareUrl,
      loomEmbedUrl,
      title,
      description,
      workoutId,
      programId,
    } = body

    // Verify sender is the current user
    if (senderId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Create video message
    const videoMessage = await prisma.videoMessage.create({
      data: {
        senderId,
        receiverId,
        loomVideoId,
        loomShareUrl,
        loomEmbedUrl,
        title,
        description,
        workoutId,
        programId,
      },
    })

    return NextResponse.json({
      success: true,
      videoMessage,
    })
  } catch (error: any) {
    console.error("Save video error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to save video message" },
      { status: 500 }
    )
  }
}
