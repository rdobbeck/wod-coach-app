'use client'

import { useState } from "react"
import { groupLabel, type GroupId } from "@/lib/muscles/groups"
import TrainIt from "./TrainIt"

/**
 * Learn opened from an exercise in a client's session: the groups it works (main ones lit fully on
 * the model, the others at half), each opening its own Train it.
 */
export default function MusclesWorked({ worked, onClear }: { worked: { primary: GroupId[]; secondary: GroupId[]; from: string | null }; onClear: () => void }) {
  const [open, setOpen] = useState<GroupId | null>(null)
  const rows = worked.primary.map((g) => ({ g, main: true })).concat(worked.secondary.map((g) => ({ g, main: false })))
  return (
    <div data-testid="muscles-worked" className="space-y-3 rounded-2xl border border-app-border bg-app-surface p-4">
      <h2 className="font-display text-2xl font-bold leading-tight">{worked.from ? `Muscles worked by ${worked.from}` : "Muscles worked"}</h2>
      <ul className="space-y-2">
        {rows.map(({ g, main }) => (
          <li key={g} className="space-y-2">
            <button
              type="button"
              onClick={() => setOpen(open === g ? null : g)}
              aria-expanded={open === g}
              className="flex w-full items-center justify-between gap-3 rounded-xl bg-app-surface2 px-3 py-2 text-left"
            >
              <span className="font-semibold">{groupLabel(g)}</span> <span className="text-xs text-app-muted">{main ? "Main" : "Also"}</span>
            </button>
            {open === g && <TrainIt key={g} group={g} />}
          </li>
        ))}
      </ul>
      <button type="button" onClick={onClear} className="text-sm font-semibold text-app-accent">
        Show all muscles
      </button>
    </div>
  )
}
