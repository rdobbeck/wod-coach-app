'use client'

import { useEffect, useRef, useState } from "react"

/**
 * Drag a workout onto a day. One implementation for both calendars:
 *
 *   - mouse: the drag starts once the pointer has moved a few pixels, so a
 *     plain click still opens the workout
 *   - touch: a long press picks it up, so a normal swipe still scrolls
 *
 * Drop targets are any element with data-drop-day="YYYY-MM-DD". Pointer
 * events rather than HTML5 drag and drop, because the latter does nothing on
 * an iPhone.
 */
export type DragState = { id: string; from: string; label: string; x: number; y: number; over: string | null; ok: boolean }

type Pending = { id: string; from: string; label: string; x0: number; y0: number; touch: boolean; timer?: ReturnType<typeof setTimeout> }

const dayAt = (x: number, y: number) =>
  document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop-day]")?.dataset.dropDay ?? null

export function useDragToDay({
  onDrop,
  canDrop = () => true,
}: {
  onDrop: (id: string, day: string) => void
  canDrop?: (day: string, from: string) => boolean
}) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const pending = useRef<Pending | null>(null)
  const suppressClick = useRef(false)
  const handlers = useRef({ onDrop, canDrop })
  handlers.current = { onDrop, canDrop }
  const startRef = useRef<(x: number, y: number) => void>(() => {})

  const set = (d: DragState | null) => {
    dragRef.current = d
    setDrag(d)
  }

  useEffect(() => {
    const start = (x: number, y: number) => {
      const p = pending.current
      if (!p) return
      clearTimeout(p.timer)
      if (p.touch) navigator.vibrate?.(15)
      const over = dayAt(x, y)
      set({ id: p.id, from: p.from, label: p.label, x, y, over, ok: !!over && over !== p.from && handlers.current.canDrop(over, p.from) })
    }
    const end = (drop: boolean) => {
      const p = pending.current
      if (p) clearTimeout(p.timer)
      pending.current = null
      const d = dragRef.current
      if (!d) return
      // Swallow the click that follows this pointerup, and only that one.
      suppressClick.current = true
      setTimeout(() => (suppressClick.current = false), 0)
      set(null)
      if (drop && d.ok && d.over) handlers.current.onDrop(d.id, d.over)
    }
    startRef.current = start

    const onMove = (e: PointerEvent) => {
      const p = pending.current
      if (!p) return
      if (!dragRef.current) {
        const dist = Math.hypot(e.clientX - p.x0, e.clientY - p.y0)
        // Moving before the long press lands means they are scrolling.
        if (p.touch) {
          if (dist > 10) end(false)
        } else if (dist > 6) start(e.clientX, e.clientY)
        return
      }
      const over = dayAt(e.clientX, e.clientY)
      set({
        ...dragRef.current,
        x: e.clientX,
        y: e.clientY,
        over,
        ok: !!over && over !== dragRef.current.from && handlers.current.canDrop(over, dragRef.current.from),
      })
    }
    const onUp = () => end(true)
    const onCancel = () => end(false)
    // Registered up front and non-passive: the only reliable way to stop an
    // iPhone scrolling the page underneath a finger that is carrying something.
    const onTouchMove = (e: TouchEvent) => dragRef.current && e.preventDefault()
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && end(false)

    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
    document.addEventListener("pointercancel", onCancel)
    document.addEventListener("keydown", onKey)
    window.addEventListener("touchmove", onTouchMove, { passive: false })
    return () => {
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
      document.removeEventListener("pointercancel", onCancel)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("touchmove", onTouchMove)
    }
  }, [])

  /** Spread onto anything that can be picked up. */
  const draggable = (id: string, from: string, label: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return
      // Stops a mouse drag from selecting text across the page. The click
      // that opens the workout still fires.
      if (e.pointerType === "mouse") e.preventDefault()
      const touch = e.pointerType !== "mouse"
      const p: Pending = { id, from, label, x0: e.clientX, y0: e.clientY, touch }
      // On touch, holding still is what picks it up.
      if (touch) p.timer = setTimeout(() => startRef.current(p.x0, p.y0), 350)
      pending.current = p
    },
    // A drag that ended over the item must not also count as a tap on it.
    onClickCapture: (e: React.MouseEvent) => {
      if (suppressClick.current) {
        e.preventDefault()
        e.stopPropagation()
        suppressClick.current = false
      }
    },
    onDragStart: (e: React.DragEvent) => e.preventDefault(),
    onContextMenu: (e: React.MouseEvent) => pending.current?.touch && e.preventDefault(),
    style: { WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" } as React.CSSProperties,
    "data-dragging": drag?.id === id ? "true" : undefined,
  })

  return { drag, draggable }
}

/** The thing under the finger while it is being carried. */
export function DragGhost({ drag, className = "" }: { drag: DragState | null; className?: string }) {
  if (!drag) return null
  return (
    <div
      className={`pointer-events-none fixed z-[60] max-w-[14rem] -translate-x-1/2 -translate-y-[130%] truncate rounded-lg px-3 py-1.5 text-sm font-semibold shadow-xl ${className}`}
      style={{ left: drag.x, top: drag.y }}
    >
      {drag.label}
    </div>
  )
}
