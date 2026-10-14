import type { Layer } from "@/lib/learn-types"

export default function LayerChips({ layers, on, onToggle }: { layers: Layer[]; on: Set<string>; onToggle: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Layers">
      {layers.map((l) => {
        const active = on.has(l.id)
        return (
          <button
            key={l.id}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(l.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? "border-app-accent bg-app-accent text-app-accent-text" : "border-app-border bg-app-surface text-app-muted"}`}
          >
            {l.label}
          </button>
        )
      })}
    </div>
  )
}
