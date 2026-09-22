import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { alertRyan } from "@/lib/alert"

/** A page crashed in someone's browser: tell Ryan which page and who hit it. */
export async function POST(req: Request) {
  const { message, path, digest } = (await req.json().catch(() => ({}))) as { message?: string; path?: string; digest?: string }
  const session = await getServerSession(authOptions).catch(() => null)
  const who = session ? `${session.user.name ?? session.user.email} (${session.user.role})` : "signed out"
  await alertRyan("WOD Coach: page crashed", `${path ?? "?"}\n${who}\n${message ?? "unknown error"}${digest ? `\ndigest ${digest}` : ""}`)
  return Response.json({ ok: true })
}
