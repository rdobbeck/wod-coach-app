'use client'

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

/** Defaults the app applies to new clients and to rest timers. */
export default function CoachDefaults({
  units,
  restSeconds,
  canMove,
}: {
  units: string
  restSeconds: number
  canMove: boolean
}) {
  const router = useRouter()
  const [rest, setRest] = useState(String(restSeconds))
  const [busy, setBusy] = useState(false)

  const save = async (body: Record<string, unknown>, done: string) => {
    setBusy(true)
    const res = await fetch("/api/coach/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    setBusy(false)
    if (!res.ok) return toast.error("Couldn't save")
    toast.success(done)
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-[#e4dfd5] bg-white p-4">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-[#857c70]">Defaults for new clients</p>

      <div className="mt-3 space-y-4">
        <div>
          <p className="text-sm text-[#6b6257]">Weight units</p>
          <div className="mt-1 flex gap-2">
            {["lb", "kg"].map((u) => (
              <button
                key={u}
                disabled={busy}
                onClick={() => save({ defaultUnits: u }, `New clients will use ${u}`)}
                aria-pressed={units === u}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold ${units === u ? "border-[#c1272d] text-[#16181d]" : "border-[#ddd7cc] text-[#6b6257]"}`}
              >
                {u === "lb" ? "Pounds" : "Kilograms"}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-[#16181d]">
          <input
            type="checkbox"
            defaultChecked={canMove}
            disabled={busy}
            onChange={(e) => save({ defaultCanMoveWorkouts: e.target.checked }, e.target.checked ? "New clients can move workouts" : "New clients can't move workouts")}
            className="h-4 w-4 rounded border-[#ddd7cc]"
          />
          New clients can move their own workouts
        </label>

        <div>
          <p className="text-sm text-[#6b6257]">Rest timer when a prescription doesn&rsquo;t say</p>
          <div className="mt-1 flex items-center gap-2">
            <input
              inputMode="numeric"
              value={rest}
              onChange={(e) => setRest(e.target.value.replace(/[^0-9]/g, ""))}
              className="w-24 rounded-xl border border-[#ddd7cc] px-3 py-2 text-base text-[#16181d]"
            />
            <span className="text-sm text-[#6b6257]">seconds</span>
            <button
              onClick={() => save({ defaultRestSeconds: Number(rest) }, `Rest timer defaults to ${rest}s`)}
              disabled={busy || !rest || Number(rest) < 15 || Number(rest) > 600 || Number(rest) === restSeconds}
              className="rounded-xl bg-[#16181d] px-4 py-2 text-sm font-semibold text-[#f4f1ea] disabled:opacity-40"
            >
              Save
            </button>
          </div>
          <p className="mt-1 text-xs text-[#857c70]">
            Prescriptions like &ldquo;rest 2-3 min&rdquo; always win; this is the fallback. 15 to 600 seconds.
          </p>
        </div>
      </div>
    </div>
  )
}
