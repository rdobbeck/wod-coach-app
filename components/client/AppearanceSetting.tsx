'use client'

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { THEMES } from "@/lib/themes"

/** Client picks the app's look; saved to their profile so it follows their devices. */
export default function AppearanceSetting({ current, units }: { current: string; units: string }) {
  const router = useRouter()
  const [theme, setTheme] = useState(current)
  const [unit, setUnit] = useState(units)
  const [busy, setBusy] = useState(false)

  const save = async (patch: { theme?: string; units?: string }) => {
    setBusy(true)
    const res = await fetch("/api/client/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    setBusy(false)
    if (!res.ok) {
      toast.error("Couldn't save that")
      setTheme(current)
      setUnit(units)
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-app-muted">Appearance</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {THEMES.map((o) => (
            <button
              key={o.id}
              disabled={busy}
              onClick={() => {
                setTheme(o.id)
                void save({ theme: o.id })
              }}
              aria-pressed={theme === o.id}
              className={`rounded-2xl border p-3 text-left ${theme === o.id ? "border-app-accent" : "border-app-border"}`}
            >
              <span
                className="flex h-14 items-center justify-center gap-2 rounded-xl border border-black/10"
                style={{ background: o.bg, color: o.fg }}
              >
                <span className="font-display text-lg font-bold">Aa</span>
                <span className="h-3 w-3 rounded-full" style={{ background: o.accent }} />
              </span>
              <span className="mt-2 flex items-baseline gap-1.5">
                <span className="truncate font-display text-lg font-semibold leading-tight">{o.name}</span>
                {theme === o.id && <span className="shrink-0 text-xs font-bold text-app-accent">✓</span>}
              </span>
              <span className="block truncate text-xs text-app-muted">{o.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-app-muted">Weight units</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {["lb", "kg"].map((u) => (
            <button
              key={u}
              disabled={busy}
              onClick={() => {
                setUnit(u)
                void save({ units: u })
              }}
              aria-pressed={unit === u}
              className={`rounded-xl border py-3 font-semibold ${unit === u ? "border-app-accent text-app-text" : "border-app-border text-app-muted"}`}
            >
              {u === "lb" ? "Pounds (lb)" : "Kilograms (kg)"}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
