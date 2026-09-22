'use client'

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

const OPTIONS = [
  { id: "dark", name: "Gym Floor", hint: "Dark", bg: "#0e0f12", fg: "#f4f1ea" },
  { id: "light", name: "Chalk", hint: "Light", bg: "#f4f2ed", fg: "#16181d" },
]

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
          {OPTIONS.map((o) => (
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
              <span className="flex h-14 items-center justify-center rounded-xl" style={{ background: o.bg, color: o.fg }}>
                <span className="font-display text-lg font-bold">Aa</span>
              </span>
              <span className="mt-2 block font-display text-lg font-semibold leading-tight">{o.name}</span>
              <span className="block text-xs text-app-muted">{o.hint}</span>
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
