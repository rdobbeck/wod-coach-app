import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { resolveTheme } from "@/lib/themes"
import BottomNav from "@/components/client/BottomNav"

/** Mobile shell for everything under /client: narrow column, bottom tabs, client's theme. */
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "CLIENT") redirect("/")
  const [profile, unread] = await Promise.all([
    prisma.clientProfile.findUnique({ where: { userId: session.user.id }, select: { theme: true } }),
    prisma.message.count({ where: { receiverId: session.user.id, isRead: false } }),
  ])

  return (
    <div data-app-theme={resolveTheme(profile?.theme)} className="min-h-screen bg-app-bg font-sans text-app-text">
      {/* Warm up connections so demo videos and thumbnails open fast. */}
      <link rel="preconnect" href="https://www.youtube-nocookie.com" />
      <link rel="preconnect" href="https://i.ytimg.com" />
      <main className="mx-auto max-w-md px-4 pt-4 pb-28">{children}</main>
      <BottomNav unread={unread} />
    </div>
  )
}
