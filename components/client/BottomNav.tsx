'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"

const tabs = [
  { href: "/client", label: "Today", match: (p: string) => p === "/client" },
  { href: "/client/workouts", label: "History", match: (p: string) => p === "/client/workouts" },
  { href: "/client/profile", label: "Profile", match: (p: string) => p.startsWith("/client/profile") },
]

export default function BottomNav() {
  const pathname = usePathname()
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-md grid grid-cols-3">
        {tabs.map((t) => {
          const active = t.match(pathname)
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`py-3 text-center text-sm font-semibold ${active ? "text-primary-600" : "text-gray-500"}`}
            >
              {t.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
