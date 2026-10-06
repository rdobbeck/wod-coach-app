'use client'

import { useState } from "react"
import { useRouter } from "next/navigation"

/** Mark a reported problem handled, or put it back in the open pile. */
export default function ResolveBugButton({ id, resolved }: { id: string; resolved: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const toggle = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/bug-reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, resolved: !resolved }),
      })
      if (res.ok) router.refresh()
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      data-testid={resolved ? "bug-reopen" : "bug-resolve"}
      className={
        resolved
          ? "rounded-lg border border-[#e4dfd5] px-3 py-1.5 text-xs font-semibold text-[#857c70] hover:bg-[#f4f1ea] disabled:opacity-50"
          : "rounded-lg bg-[#0e0f12] px-3 py-1.5 text-xs font-semibold text-[#f4f1ea] hover:bg-[#2a2c31] disabled:opacity-50"
      }
    >
      {busy ? "…" : resolved ? "Reopen" : "Mark resolved"}
    </button>
  )
}
