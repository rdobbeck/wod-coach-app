import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import BottomNav from "@/components/client/BottomNav"

// Mobile-first shell for everything under /client: narrow column + bottom tabs.
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "CLIENT") redirect("/")

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Warm up connections so demo videos and thumbnails open fast. */}
      <link rel="preconnect" href="https://www.youtube-nocookie.com" />
      <link rel="preconnect" href="https://i.ytimg.com" />
      <main className="mx-auto max-w-md px-4 pt-4 pb-24">{children}</main>
      <BottomNav />
    </div>
  )
}
