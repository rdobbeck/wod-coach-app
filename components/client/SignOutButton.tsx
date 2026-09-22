'use client'

import { signOut } from "next-auth/react"

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="w-full rounded-xl border border-app-border bg-app-surface py-3 text-base font-semibold text-app-text"
    >
      Sign out
    </button>
  )
}
