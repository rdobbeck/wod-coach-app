// Pure helpers for exercise demo videos (no server imports; used by client components).

export type VideoInfo = { kind: "youtube"; id: string; vertical: boolean } | { kind: "link"; url: string }

/** Recognize YouTube (watch, youtu.be, shorts, embed) links; anything else is a plain link. */
export function parseVideo(url: string | null | undefined): VideoInfo | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/)
  if (m) return { kind: "youtube", id: m[1], vertical: /\/shorts\//.test(url) }
  return { kind: "link", url }
}

export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

/** Embed tuned for exercise demos: autoplay (muted, so phones allow it), inline, looped, minimal chrome. */
export function youtubeEmbed(id: string, { muted = true }: { muted?: boolean } = {}) {
  const q = new URLSearchParams({
    autoplay: "1",
    mute: muted ? "1" : "0",
    playsinline: "1",
    loop: "1",
    playlist: id, // required for loop to work on a single video
    rel: "0",
    modestbranding: "1",
    controls: "1",
  })
  return `https://www.youtube-nocookie.com/embed/${id}?${q}`
}
