'use client'

import { signOut } from "next-auth/react"
import Link from "next/link"

interface DashboardHeaderProps {
  userName: string
  role: "COACH" | "CLIENT"
}

export default function DashboardHeader({ userName, role }: DashboardHeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link href={role === "COACH" ? "/coach" : "/client"} className="text-2xl font-black text-gray-900">
              WOD
            </Link>
            <span className="ml-2 text-sm text-gray-500 uppercase tracking-wider">
              {role === "COACH" ? "Coach" : "Client"}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-700">
              {userName}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
