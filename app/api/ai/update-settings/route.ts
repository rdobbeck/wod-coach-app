import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { seal } from "@/lib/secret-box"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || session.user.role !== "COACH") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const coach = await prisma.coachProfile.findUnique({
      where: { userId: session.user.id },
    })

    if (!coach) {
      return NextResponse.json({ error: "Coach profile not found" }, { status: 404 })
    }

    const body = await req.json()
    const { aiProvider, openrouterApiKey, preferredModel } = body

    // The key is sealed before it's stored and never sent back. "" removes it;
    // leaving it out keeps whatever is saved.
    let keyData: { openrouterApiKey: string | null } | Record<string, never> = {}
    if (typeof openrouterApiKey === "string") {
      const k = openrouterApiKey.trim()
      if (k && !/^sk-or-[A-Za-z0-9_-]{10,}$/.test(k)) {
        return NextResponse.json({ error: "That doesn't look like an OpenRouter key (it starts with sk-or-)" }, { status: 400 })
      }
      keyData = { openrouterApiKey: k ? seal(k) : null }
    }

    // Update settings
    await prisma.coachProfile.update({
      where: { id: coach.id },
      data: {
        ...(aiProvider && { aiProvider }),
        ...keyData,
        ...(preferredModel && { preferredModel }),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("AI settings update error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to update settings" },
      { status: 500 }
    )
  }
}
