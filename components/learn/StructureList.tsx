'use client'

import { useState } from "react"
import type { Structure } from "@/lib/learn-types"
import { filterStructures, KIND_LABEL } from "@/lib/learn-viewer"

export default function StructureList({ items, selectedId, onSelect }: { items: Structure[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("")
  const shown = filterStructures(items, query)
  return (
    <div className="rounded-2xl border border-app-border bg-app-surface">
      <div className="p-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search structures"
          aria-label="Search structures"
          className="h-11 w-full rounded-xl border border-app-border bg-app-bg px-3 text-sm"
        />
      </div>
      <ul className="max-h-[40vh] overflow-y-auto px-2 pb-2 md:max-h-[48vh]">
        {shown.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              aria-label={s.label}
              aria-pressed={s.id === selectedId}
              data-testid="structure-item"
              onClick={() => onSelect(s.id)}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm ${s.id === selectedId ? "bg-app-accent text-app-accent-text" : "hover:bg-app-surface2"}`}
            >
              <span>{s.label}</span>
              <span className={`text-[11px] ${s.id === selectedId ? "" : "text-app-muted"}`}>{KIND_LABEL[s.kind]}</span>
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="px-3 py-4 text-sm text-app-muted">Nothing matches.</li>}
      </ul>
    </div>
  )
}
