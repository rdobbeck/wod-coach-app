'use client'

import { useState } from "react"

/** A promo code the client taps to copy before heading to the store. */
export default function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } catch {
          // No clipboard (old browser, no permission): the code is still readable.
        }
      }}
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-dashed border-app-accent/60 bg-app-surface2 px-3 font-mono text-sm font-bold tracking-wider text-app-text"
      aria-label={`Copy code ${code}`}
    >
      {code}
      <span className="font-sans text-xs font-semibold text-app-accent">{copied ? "Copied" : "Copy"}</span>
    </button>
  )
}
