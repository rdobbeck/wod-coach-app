'use client'

import { useEffect, useState } from "react"
import { DEFAULT_TEXT_SIZE, TEXT_SIZE_KEY, TEXT_SIZES, textSizePx, type TextSizeId } from "@/lib/text-size"

const read = (): TextSizeId => {
  try {
    const v = localStorage.getItem(TEXT_SIZE_KEY)
    if (TEXT_SIZES.some((s) => s.id === v)) return v as TextSizeId
  } catch {}
  return DEFAULT_TEXT_SIZE
}
const applySize = (id: string) => {
  document.documentElement.style.fontSize = `${textSizePx(id)}px`
}

/**
 * Keeps the client's text size on the page while they are in the client app,
 * and hands the root back when they leave it (a coach screen after sign-out
 * keeps its own size). The first paint is handled by TEXT_SIZE_SCRIPT.
 */
export function TextSizeRoot() {
  useEffect(() => {
    applySize(read())
    return () => {
      document.documentElement.style.fontSize = ""
    }
  }, [])
  return null
}

/** Settings: pick a text size, previewed live on this device. */
export default function TextSizeSetting() {
  const [size, setSize] = useState<TextSizeId>(DEFAULT_TEXT_SIZE)
  useEffect(() => setSize(read()), [])

  const pick = (id: TextSizeId) => {
    setSize(id)
    applySize(id)
    try {
      localStorage.setItem(TEXT_SIZE_KEY, id)
    } catch {}
  }

  return (
    <div>
      <p className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-app-muted">Text size</p>
      <div className="mt-2 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Text size">
        {TEXT_SIZES.map((s) => (
          <button
            key={s.id}
            role="radio"
            aria-checked={size === s.id}
            onClick={() => pick(s.id)}
            className={`flex flex-col items-center justify-end gap-1 rounded-xl border px-1 py-2 ${size === s.id ? "border-app-accent text-app-text" : "border-app-border text-app-muted"}`}
          >
            {/* The sample is drawn at the size it stands for, whatever size the page is at now. */}
            <span className="font-display font-bold leading-none" style={{ fontSize: `${s.px * 1.25}px` }} aria-hidden="true">
              Aa
            </span>
            <span className="text-xs font-semibold leading-tight">{s.name}</span>
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-app-muted">Makes text and buttons bigger across the app on this phone.</p>
    </div>
  )
}
