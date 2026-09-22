'use client'

import { parseVideo, youtubeThumb } from "@/lib/video"

/** Tappable 16:9 video preview (YouTube frame + play button); opens the full-screen player. */
export default function VideoThumb({ url, title, onPlay, className = "", compact = false }: { url: string; title: string; onPlay: () => void; className?: string; compact?: boolean }) {
  const v = parseVideo(url)
  return (
    <button onClick={onPlay} className={`group relative block aspect-video w-full overflow-hidden rounded-xl bg-gray-900 ${className}`} aria-label={`Play ${title} video`}>
      {v?.kind === "youtube" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={youtubeThumb(v.id)} alt="" loading="lazy" className="h-full w-full object-cover opacity-90 transition group-active:scale-[0.99]" />
      )}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className={`flex items-center justify-center rounded-full bg-white/90 shadow-lg ${compact ? "h-8 w-8" : "h-14 w-14"}`}>
          <span className={`ml-0.5 block h-0 w-0 border-y-transparent border-l-gray-900 ${compact ? "border-y-[6px] border-l-[10px]" : "border-y-[10px] border-l-[16px]"}`} />
        </span>
      </span>
      {!compact && <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">Watch demo</span>}
    </button>
  )
}
