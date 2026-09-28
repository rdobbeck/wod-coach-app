import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"

/**
 * The signed-in client, or a redirect: signed out goes to sign-in, a coach to
 * their own app. Every /client page calls this itself; the layout's redirect
 * isn't enough, because Next renders the page alongside the layout, and a page
 * that assumes a session crashes before the layout's redirect lands (that's the
 * error screen a home-screen app showed once its sign-in expired).
 */
export async function requireClient() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/auth/signin")
  if (session.user.role !== "CLIENT") redirect(session.user.role === "COACH" ? "/coach" : "/")
  return session
}
