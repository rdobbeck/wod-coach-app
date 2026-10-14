import type { Role, Structure } from "@/lib/learn-types"
import { KIND_LABEL, ROLE_LABEL } from "@/lib/learn-viewer"

export default function StructureCard({ structure, role, movementLabel }: { structure: Structure | null; role: Role | null; movementLabel?: string }) {
  if (!structure) {
    return (
      <div data-testid="structure-card" className="rounded-2xl border border-app-border bg-app-surface p-4">
        <h2 className="font-display text-xl font-bold">Tap a structure</h2>
        <p className="text-sm text-app-muted">Drag to turn, pinch to zoom. Tap anything to read what it is and what it does.</p>
      </div>
    )
  }
  return (
    <div data-testid="structure-card" className="space-y-3 rounded-2xl border border-app-border bg-app-surface p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-app-accent">
          {KIND_LABEL[structure.kind]}{role ? ` · ${role}` : ""}
        </p>
        <h2 className="font-display text-2xl font-bold leading-tight">{structure.label}</h2>
        {role && movementLabel && <p className="text-sm text-app-muted">In {movementLabel.toLowerCase()}: {ROLE_LABEL[role]}.</p>}
      </div>
      {structure.coachNote && (
        <div className="rounded-xl bg-app-surface2 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-app-accent">Coach&apos;s note</p>
          <p className="text-sm">{structure.coachNote}</p>
        </div>
      )}
      {structure.definition && (
        <div>
          <p className="text-sm text-app-text">{structure.definition.text}</p>
          <p className="mt-1 text-[11px] text-app-muted">Excerpt from Wikipedia via Z-Anatomy, edited. CC BY-SA.</p>
        </div>
      )}
    </div>
  )
}
