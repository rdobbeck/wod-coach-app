'use client'

import { useEffect, useRef, useState } from "react"
import { parseVideo, youtubeEmbed } from "@/lib/video"

export type PlayerItem = { key: string; title: string; subtitle?: string | null; url: string }

/**
 * Full-screen demo player. Opens on `startIndex` and lets the viewer flip through
 * every demo in `items` (Prev/Next, arrow keys) without closing. Closes on X, Esc
 * or the phone's back gesture (it pushes a history entry while open).
 */
export default function VideoPlayer({ items, startIndex, onClose }: { items: PlayerItem[]; startIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex)
  const [muted, setMuted] = useState(true)
  const [canFullscreen, setCanFullscreen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const item = items[index]
  const video = parseVideo(item?.url)

  // Latest values for the one-time effect below (it must not re-run, or it would
  // push a new history entry on every render).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const countRef = useRef(items.length)
  countRef.current = items.length

  useEffect(() => {
    setCanFullscreen(!!document.fullscreenEnabled && !!box.current?.requestFullscreen)
    // Back gesture / Android back button closes the player instead of leaving the page.
    history.pushState({ videoPlayer: true }, "")
    const onPop = () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
      onCloseRef.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") history.back()
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, countRef.current - 1))
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0))
    }
    window.addEventListener("popstate", onPop)
    window.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("popstate", onPop)
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [])

  if (!item) return null
  const dismiss = () => history.back() // pops our history entry -> onPop -> onClose

  return (
    <div ref={box} className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-label={`${item.title} video`}>
      <div className="flex items-center gap-3 px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold">{item.title}</p>
          {items.length > 1 && <p className="text-xs text-white/60">{index + 1} of {items.length}</p>}
        </div>
        {video?.kind === "youtube" && (
          <button onClick={() => setMuted((m) => !m)} className="rounded-full bg-white/15 px-3 py-2 text-sm font-semibold" aria-label={muted ? "Turn sound on" : "Mute"}>
            {muted ? "🔇 Sound" : "🔊 On"}
          </button>
        )}
        {canFullscreen && (
          <button
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : box.current?.requestFullscreen())}
            className="rounded-full bg-white/15 px-3 py-2 text-sm font-semibold"
            aria-label="Full screen"
          >
            ⛶
          </button>
        )}
        <button onClick={dismiss} className="rounded-full bg-white/15 px-3 py-2 text-lg font-bold leading-none" aria-label="Close video">
          ✕
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-2">
        {video?.kind === "youtube" ? (
          <div className={`${video.vertical ? "aspect-[9/16] h-full max-h-full" : "aspect-video w-full max-w-5xl"} max-w-full overflow-hidden rounded-xl bg-black`}>
            <iframe
              key={`${video.id}-${muted}`}
              src={youtubeEmbed(video.id, { muted })}
              className="h-full w-full"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              title={item.title}
            />
          </div>
        ) : (
          <a href={item.url} target="_blank" rel="noreferrer" className="rounded-xl bg-white/15 px-5 py-3 font-semibold">
            Open video ↗
          </a>
        )}
      </div>

      <div className="space-y-3 px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {item.subtitle && <p className="line-clamp-3 whitespace-pre-line text-center text-sm text-white/80">{item.subtitle}</p>}
        {items.length > 1 && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setIndex((i) => i - 1)}
              disabled={index === 0}
              className="rounded-xl bg-white/15 py-3 text-sm font-semibold disabled:opacity-30"
            >
              ‹ {index > 0 ? items[index - 1].title : "Prev"}
            </button>
            <button
              onClick={() => setIndex((i) => i + 1)}
              disabled={index === items.length - 1}
              className="truncate rounded-xl bg-white/15 px-2 py-3 text-sm font-semibold disabled:opacity-30"
            >
              {index < items.length - 1 ? items[index + 1].title : "Next"} ›
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
