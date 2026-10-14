'use client'

import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import type { Scene, Structure } from "@/lib/learn-types"
import { hiddenByLayers } from "@/lib/learn-viewer"
import LayerChips from "./LayerChips"
import MovementSlider from "./MovementSlider"
import StructureCard from "./StructureCard"
import StructureList from "./StructureList"

const AnatomyViewer = dynamic(() => import("./AnatomyViewer"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-app-surface2" aria-hidden="true" />,
})

export default function SceneView({ scene, structures, ctaUrl }: { scene: Scene; structures: Record<string, Structure>; ctaUrl?: string }) {
  const poster = useSearchParams().get("poster") === "1"
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [angle, setAngle] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [layersOn, setLayersOn] = useState<Set<string>>(() => new Set((scene.layers ?? []).filter((l) => l.defaultOn).map((l) => l.id)))

  const items = useMemo(() => scene.structures.map((id) => structures[id]).filter(Boolean), [scene, structures])
  const hiddenIds = useMemo(() => hiddenByLayers(scene, layersOn), [scene, layersOn])
  const selected = selectedId ? structures[selectedId] ?? null : null
  const role = selectedId && scene.movement ? scene.movement.roles[selectedId] ?? null : null

  const toggleLayer = (id: string) => setLayersOn((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })

  const canvas = (
    <div className={`relative overflow-hidden rounded-2xl border border-app-border bg-app-surface ${poster ? "h-[100vh] rounded-none border-0" : "h-[58vh] md:h-[70vh]"}`}>
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
          onReady={() => { setReady(true); setError(null) }}
          onError={(m) => { setError(m); setReady(false); setPlaying(false) }}
        />
      </div>
      {error && (
        <p role="alert" data-testid="viewer-error" className="absolute inset-x-3 top-3 z-20 rounded-xl bg-app-surface/95 px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {!poster && scene.layers && (
        <div className="absolute inset-x-3 top-3 z-20">
          <LayerChips layers={scene.layers} on={layersOn} onToggle={toggleLayer} />
        </div>
      )}
    </div>
  )

  if (poster) return canvas

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-4">
      <div className="min-w-0 flex-1 space-y-3">
        {canvas}
        {scene.movement && (
          <MovementSlider movement={scene.movement} angle={angle} playing={playing} onAngle={(a) => { setPlaying(false); setAngle(a) }} onPlay={() => setPlaying((p) => !p)} />
        )}
      </div>
      <aside className="space-y-3 md:w-80 md:shrink-0" aria-label="Structure details">
        <StructureCard structure={selected} role={role} movementLabel={scene.movement?.label} />
        {ctaUrl && (
          <a href={ctaUrl} className="flex h-11 items-center justify-center rounded-xl bg-app-accent text-sm font-bold text-app-accent-text">
            Train with Ryan
          </a>
        )}
        <StructureList items={items} selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
    </div>
  )
}
