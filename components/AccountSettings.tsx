'use client'

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

/**
 * Name and password, for coaches and clients. `tone` picks the palette:
 * the coach screens are plain light, the client app uses its theme tokens.
 */
export default function AccountSettings({
  name: initialName,
  email,
  hasPassword,
  tone = "coach",
}: {
  name: string
  email: string
  hasPassword: boolean
  tone?: "coach" | "client"
}) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [busy, setBusy] = useState(false)

  const c =
    tone === "client"
      ? { card: "border-app-border bg-app-surface", label: "text-app-muted", input: "border-app-border bg-app-bg text-app-text", button: "bg-app-accent text-app-accent-text" }
      : { card: "border-[#e4dfd5] bg-white", label: "text-[#857c70]", input: "border-[#ddd7cc] bg-white text-[#16181d]", button: "bg-[#16181d] text-[#f4f1ea]" }

  const save = async (body: Record<string, unknown>, done: string) => {
    setBusy(true)
    const res = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    setBusy(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error ?? "Couldn't save")
    toast.success(done)
    setCurrent("")
    setNext("")
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-4 ${c.card}`}>
        <p className={`font-display text-xs font-semibold uppercase tracking-[0.14em] ${c.label}`}>Account</p>
        <label className="mt-3 block">
          <span className={`text-sm ${c.label}`}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 block w-full rounded-xl border px-3 py-2 text-base ${c.input}`} />
        </label>
        <p className={`mt-2 text-sm ${c.label}`}>Email: {email}</p>
        <button
          onClick={() => save({ name }, "Name saved")}
          disabled={busy || !name.trim() || name === initialName}
          className={`mt-3 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40 ${c.button}`}
        >
          Save name
        </button>
      </div>

      <div className={`rounded-2xl border p-4 ${c.card}`}>
        <p className={`font-display text-xs font-semibold uppercase tracking-[0.14em] ${c.label}`}>{hasPassword ? "Change password" : "Set a password"}</p>
        <div className="mt-3 space-y-3">
          {hasPassword && (
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="Current password"
              className={`block w-full rounded-xl border px-3 py-2 text-base ${c.input}`}
            />
          )}
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="New password (8+ characters)"
            className={`block w-full rounded-xl border px-3 py-2 text-base ${c.input}`}
          />
          <button
            onClick={() => save({ currentPassword: current, newPassword: next }, "Password updated")}
            disabled={busy || next.length < 8 || (hasPassword && !current)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40 ${c.button}`}
          >
            {hasPassword ? "Update password" : "Set password"}
          </button>
        </div>
      </div>
    </div>
  )
}
