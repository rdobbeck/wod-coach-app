import type { Movement } from "@/lib/learn-types"

export default function MovementSlider({ movement, angle, playing, onAngle, onPlay }: { movement: Movement; angle: number; playing: boolean; onAngle: (a: number) => void; onPlay: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-app-border bg-app-surface px-3 py-2">
      <label htmlFor="learn-angle" className="whitespace-nowrap text-xs font-semibold text-app-muted">{movement.label}</label>
      <input
        id="learn-angle"
        type="range"
        min={movement.range[0]}
        max={movement.range[1]}
        step={1}
        value={Math.round(angle)}
        aria-label={movement.label}
        onChange={(e) => onAngle(Number(e.target.value))}
        className="flex-1 accent-app-accent"
      />
      <output data-testid="angle-out" className="min-w-[4ch] text-right font-mono text-xs">{Math.round(angle)}°</output>
      <button type="button" onClick={onPlay} className="rounded-lg border border-app-border px-2.5 py-1 text-xs font-semibold">{playing ? "Pause" : "Play"}</button>
    </div>
  )
}
