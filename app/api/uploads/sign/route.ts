import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { ALLOWED_MIME, MAX_BYTES, signUpload } from "@/lib/uploads"

/**
 * Hand the browser a one-shot URL to upload straight to storage.
 *
 * The file never passes through this server, which is what makes a 50MB phone
 * video workable at all: a serverless request body would cap out long before.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const { mime, size } = (await req.json()) as { mime?: string; size?: number }
  if (!mime || !(ALLOWED_MIME as readonly string[]).includes(mime)) {
    return NextResponse.json({ error: "That file type isn't supported" }, { status: 400 })
  }
  if (!Number.isFinite(size) || size! <= 0 || size! > MAX_BYTES) {
    return NextResponse.json({ error: "Files need to be under 50MB" }, { status: 400 })
  }

  try {
    return NextResponse.json(await signUpload(session.user.id, mime))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
