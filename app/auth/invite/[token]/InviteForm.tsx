'use client'

import { useState } from "react"
import { signIn } from "next-auth/react"
import { AuthError, authField, authLabel, authPrimary } from "@/components/auth/AuthShell"

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
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className={authLabel}>Email</label>
        <input value={email} disabled className={authField} />
      </div>
      <div>
        <label htmlFor="new-password" className={authLabel}>Password</label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="8 characters or more"
          className={authField}
        />
      </div>
      {error && <AuthError>{error}</AuthError>}
      <button disabled={loading} className={authPrimary}>
        {loading ? "Setting up..." : "Set password & start"}
      </button>
      <p className="text-center text-xs text-[#8c8478]">Tip: add this page to your home screen for one-tap access.</p>
    </form>
  )
}
