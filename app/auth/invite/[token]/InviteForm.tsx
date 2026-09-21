'use client'

import { useState } from "react"
import { signIn } from "next-auth/react"

export default function InviteForm({ token, email }: { token: string; email: string }) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    const res = await fetch("/api/auth/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? "Something went wrong")
      setLoading(false)
      return
    }
    await signIn("credentials", { email: data.email, password, callbackUrl: "/client" })
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-3">
      <input value={email} disabled className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-base text-gray-600" />
      <input
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Choose a password (8+ characters)"
        className="block w-full rounded-xl border border-gray-300 px-3 py-3 text-base"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={loading} className="w-full rounded-xl bg-primary-600 py-3 text-base font-bold text-white disabled:opacity-60">
        {loading ? "Setting up…" : "Set password & start"}
      </button>
      <p className="text-center text-xs text-gray-500">Tip: add this page to your home screen for one-tap access.</p>
    </form>
  )
}
