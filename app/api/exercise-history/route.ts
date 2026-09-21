import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canAccessClient, getExerciseHistory } from "@/lib/training"

/** GET ?clientId=&exerciseId=&name= -> every logged instance of that exercise, newest first. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const clientId = url.searchParams.get("clientId") ?? session.user.id
  const exerciseId = url.searchParams.get("exerciseId")
  const name = url.searchParams.get("name") ?? ""
  if (!exerciseId && !name) return NextResponse.json({ error: "exerciseId or name required" }, { status: 400 })
  if (!(await canAccessClient(session.user.id, clientId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const history = await getExerciseHistory(clientId, { exerciseId, name })
  return NextResponse.json({ history })
}
