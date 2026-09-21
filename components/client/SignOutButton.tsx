'use client'

import { signOut } from "next-auth/react"

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="w-full rounded-xl border border-gray-300 bg-white py-3 text-base font-semibold text-gray-700"
    >
      Sign out
    </button>
  )
}
