'use client'

import dynamic from "next/dynamic"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useMemo, useRef, useState } from "react"
import type { Scene, Structure } from "@/lib/learn-types"
import { hiddenByLayers, KIND_LABEL } from "@/lib/learn-viewer"
import { groupOfStructure, highlightOf, parseWorked } from "@/lib/muscles/groups"
import LayerChips from "./LayerChips"
import MovementSlider from "./MovementSlider"
import MusclesWorked from "./MusclesWorked"
import StructureCard from "./StructureCard"
import StructureList from "./StructureList"
import TrainIt from "./TrainIt"

const AnatomyViewer = dynamic(() => import("./AnatomyViewer"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-app-surface2" aria-hidden="true" />,
})

/**
 * "responsive" puts the card and list beside the canvas on wide viewports (public pages).
 * "stack" always stacks them: the client shell is a phone-width column even on an iPad.
 */
type Layout = "responsive" | "stack"

export default function SceneView({ scene, structures, ctaUrl, layout = "responsive" }: { scene: Scene; structures: Record<string, Structure>; ctaUrl?: string; layout?: Layout }) {
  const params = useSearchParams()
  const poster = params.get("poster") === "1"
  // Muscles worked, opened from a client's session: ?highlight=glutes,hamstrings&also=lower-back&from=Romanian+Deadlift
  const worked = useMemo(() => parseWorked((k) => params.get(k)), [params])
  const highlight = useMemo(() => highlightOf(worked), [worked])
  const router = useRouter()
  const pathname = usePathname()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [angle, setAngle] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [layersOn, setLayersOn] = useState<Set<string>>(() => new Set((scene.layers ?? []).filter((l) => l.defaultOn).map((l) => l.id)))
  const canvasRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const items = useMemo(() => scene.structures.map((id) => structures[id]).filter(Boolean), [scene, structures])
  const hiddenIds = useMemo(() => hiddenByLayers(scene, layersOn), [scene, layersOn])
  const selected = selectedId ? structures[selectedId] ?? null : null
  const role = selectedId && scene.movement ? scene.movement.roles[selectedId] ?? null : null
  const group = selectedId ? groupOfStructure(selectedId) : null
  const row = layout === "responsive"

  const toggleLayer = (id: string) => setLayersOn((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })

  // Picking from the list on a phone happens below the canvas: bring the canvas (and its selection bar) back into view.
  const pickFromList = (id: string) => {
    setSelectedId(id)
    canvasRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }
  const showCard = () => {
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const canvas = (
    <div ref={canvasRef} className={`relative overflow-hidden rounded-2xl border border-app-border bg-app-surface ${poster ? "h-[100vh] rounded-none border-0" : row ? "h-[58vh] md:h-[70vh]" : "h-[58vh]"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static poster from public/anatomy/posters */}
      <img src={`/anatomy/posters/${scene.id}.jpg`} alt="" aria-hidden="true" className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity ${ready && !error ? "opacity-0" : "opacity-40"}`} />
      <div className="relative z-10 h-full">
        <AnatomyViewer
          scene={scene}
          structures={structures}
          selectedId={selectedId}
          onSelect={setSelectedId}
          angle={angle}
          onAngle={setAngle}
          playing={playing}
          hiddenIds={hiddenIds}
          highlight={highlight}
          onReady={() => { setReady(true); setError(null) }}
          onError={(m) => { setError(m); setReady(false); setPlaying(false) }}
        />
      </div>
      {/* Chips and the error line share one column so neither covers the other. */}
      {((!poster && scene.layers) || error) && (
        <div className="absolute inset-x-3 top-3 z-20 flex flex-col items-start gap-2">
          {!poster && scene.layers && <LayerChips layers={scene.layers} on={layersOn} onToggle={toggleLayer} />}
          {error && (
            <p role="alert" data-testid="viewer-error" className="rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm">
              {error}
            </p>
          )}
        </div>
      )}
      {!poster && selected && (
        <div data-testid="selection-bar" className="absolute inset-x-3 bottom-3 z-20 flex items-center justify-between gap-3 rounded-xl border border-app-border bg-app-surface px-3 py-2">
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-bold leading-tight">{selected.label}</p>
            <p className="text-xs text-app-muted">{KIND_LABEL[selected.kind]}{role ? ` · ${role}` : ""}</p>
          </div>
          <button type="button" onClick={showCard} className="shrink-0 rounded-lg border border-app-border px-3 py-1.5 text-xs font-semibold">
            Details
          </button>
        </div>
      )}
    </div>
  )

  if (poster) return canvas

  return (
    <div className={row ? "flex flex-col gap-3 md:flex-row md:items-start md:gap-4" : "flex flex-col gap-3"}>
      <div className="min-w-0 flex-1 space-y-3">
        {canvas}
        {scene.movement && (
          <MovementSlider movement={scene.movement} angle={angle} playing={playing} onAngle={(a) => { setPlaying(false); setAngle(a) }} onPlay={() => setPlaying((p) => !p)} />
        )}
      </div>
      <aside className={row ? "space-y-3 md:w-80 md:shrink-0" : "space-y-3"} aria-label="Structure details">
        <div ref={cardRef} className="scroll-mt-4 space-y-3">
          {highlight && <MusclesWorked worked={worked} onClear={() => router.replace(pathname, { scroll: false })} />}
          {(selected || !highlight) && <StructureCard structure={selected} role={role} movementLabel={scene.movement?.label} />}
          {group && <TrainIt key={group} group={group} />}
        </div>
        {ctaUrl && (
          <a href={ctaUrl} className="flex h-11 items-center justify-center rounded-xl bg-app-accent text-sm font-bold text-app-accent-text">
            Train with Ryan
          </a>
        )}
        <StructureList items={items} selectedId={selectedId} onSelect={pickFromList} />
      </aside>
    </div>
  )
}
