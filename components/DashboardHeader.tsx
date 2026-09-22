'use client'

import { signOut } from "next-auth/react"
import Link from "next/link"
import { usePathname } from "next/navigation"

interface DashboardHeaderProps {
  userName: string
  role: "COACH" | "CLIENT"
}

const coachNav = [
  { href: "/coach", label: "Dashboard", exact: true },
  { href: "/coach/clients", label: "Clients" },
  { href: "/coach/programs", label: "Programs" },
  { href: "/coach/library", label: "Library" },
]

export default function DashboardHeader({ userName, role }: DashboardHeaderProps) {
  const pathname = usePathname()
  return (
    <header className="bg-[#0e0f12] text-[#f4f1ea]">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link href={role === "COACH" ? "/coach" : "/client"} className="font-display text-2xl font-bold tracking-wide">
          WOD<span className="text-[#c1272d]">.</span>COACH
        </Link>
        {role === "COACH" && (
          <nav className="hidden items-center gap-5 sm:flex">
            {coachNav.map((n) => {
              const active = n.exact ? pathname === n.href : pathname.startsWith(n.href)
              return (
                <Link key={n.href} href={n.href} className={`text-sm ${active ? "font-semibold text-[#f4f1ea]" : "font-medium text-[#9a9287] hover:text-[#f4f1ea]"}`}>
                  {n.label}
                </Link>
              )
            })}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-4">
          <span className="text-sm text-[#9a9287]">{userName}</span>
          <button onClick={() => signOut({ callbackUrl: "/" })} className="rounded-md px-3 py-1.5 text-sm font-medium text-[#9a9287] transition hover:bg-white/10 hover:text-[#f4f1ea]">
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
