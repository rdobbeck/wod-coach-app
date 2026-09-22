'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"

const tabs = [
  {
    href: "/client",
    label: "Today",
    match: (p: string) => p === "/client",
    icon: <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  },
  {
    href: "/client/workouts",
    label: "History",
    match: (p: string) => p === "/client/workouts",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  {
    href: "/client/profile",
    label: "Profile",
    match: (p: string) => p.startsWith("/client/profile"),
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M6 20a6 6 0 0 1 12 0" />
      </>
    ),
  },
]

export default function BottomNav() {
  const pathname = usePathname()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-app-border bg-app-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-3">
        {tabs.map((t) => {
          const active = t.match(pathname)
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-1 py-3 text-[11px] font-semibold ${active ? "text-app-accent" : "text-app-muted"}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                {t.icon}
              </svg>
              {t.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
