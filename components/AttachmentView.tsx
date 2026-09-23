'use client'

import { useState } from "react"

export type Attached = { id: string; mime: string; url: string | null }

/**
 * Photos and videos on a comment. Thumbnails in the thread, full screen on tap,
 * which is how a form check actually gets watched on a phone.
 */
export default function AttachmentView({ items }: { items: Attached[] }) {
  const [open, setOpen] = useState<Attached | null>(null)
  const shown = items.filter((a) => a.url)
  if (!shown.length) return null

  return (
    <>
      <ul className="mt-2 flex flex-wrap gap-2">
        {shown.map((a) => (
          <li key={a.id}>
            <button
              onClick={() => setOpen(a)}
              className="relative block h-20 w-20 overflow-hidden rounded-lg bg-black/40"
              aria-label={a.mime.startsWith("video/") ? "Play video" : "View photo"}
            >
              {a.mime.startsWith("video/") ? (
                <>
                  <video src={a.url!} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                  <span className="absolute inset-0 flex items-center justify-center text-2xl text-white drop-shadow">▶</span>
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url!} alt="" className="h-full w-full object-cover" />
              )}
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black"
          onClick={(e) => e.target === e.currentTarget && setOpen(null)}
        >
          <div className="flex justify-end p-3">
            <button
              onClick={() => setOpen(null)}
              className="rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold text-white"
            >
              ✕ Close
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-3">
            {open.mime.startsWith("video/") ? (
              <video src={open.url!} className="max-h-full max-w-full" controls autoPlay playsInline />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={open.url!} alt="" className="max-h-full max-w-full object-contain" />
            )}
          </div>
        </div>
      )}
    </>
  )
}
