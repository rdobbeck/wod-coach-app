'use client'

import { useEffect, useRef, useState } from "react"

/**
 * A one-time tip shown where a feature is, the first time it matters, instead
 * of up front in the tour. It goes away for good on "Got it", or on its own
 * once `done` turns true (the client has just done the thing it explains).
 * Remembered per device: nothing breaks if storage is unavailable, the tip
 * just shows again.
 */
export default function Hint({ id, done = false, children }: { id: string; done?: boolean; children: React.ReactNode }) {
  const key = `hint:${id}`
  const [show, setShow] = useState(false)
  const shown = useRef(false)

  useEffect(() => {
    try {
      setShow(!localStorage.getItem(key))
    } catch {
      setShow(true)
    }
  }, [key])

  const dismiss = () => {
    setShow(false)
    try {
      localStorage.setItem(key, "1")
    } catch {}
  }

  if (show) shown.current = true
  useEffect(() => {
    if (done && shown.current) dismiss()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  if (!show) return null
  return (
    <div role="note" className="flex items-start gap-3 rounded-xl border border-app-accent/40 bg-app-surface2 px-3 py-2.5 text-sm text-app-text">
      <p className="flex-1 leading-snug">{children}</p>
      <button onClick={dismiss} className="shrink-0 text-xs font-semibold text-app-accent">
        Got it
      </button>
    </div>
  )
}
