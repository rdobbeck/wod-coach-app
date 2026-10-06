'use client'

/*
 * Rest timer surface. Adapted from uselayouts "Set Timer"
 * (https://github.com/iurvish/uselayouts, MIT License, Copyright (c) iurvish).
 * The demo kept its own clock; here the countdown lives in WorkoutPlayer and
 * this is the view: running (Pause / time / Skip) and an adjust wheel that
 * opens when the time is tapped.
 */

import "@ncdai/react-wheel-picker/style.css"

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import * as WheelPickerPrimitive from "@ncdai/react-wheel-picker"
import { cn } from "@/lib/cn"
import { formatClock } from "@/lib/rest"

type Mode = "running" | "picker"

/** Heights per layer; width is whatever the container gives us. */
const SURFACE_HEIGHT: Record<Mode, number> = { running: 128, picker: 216 }
const SURFACE_RADIUS = 28
const SURFACE_SPRING = { type: "spring", stiffness: 400, damping: 30, mass: 1.5 } as const

/** Adjust wheel: 0:15 to 10:00 in 15-second steps. */
const STEP = 15
const MAX_SECONDS = 600
const OPTION_ITEM_HEIGHT = 40
const OPTIONS: WheelPickerPrimitive.WheelPickerOption<number>[] = Array.from({ length: MAX_SECONDS / STEP }, (_, i) => {
  const value = (i + 1) * STEP
  return { label: formatClock(value), value, textValue: `${formatClock(value)} rest` }
})
const snap = (seconds: number) => Math.min(MAX_SECONDS, Math.max(STEP, Math.round(seconds / STEP) * STEP))

const BORDER_STROKE = 5

// Theme colours are plain CSS variables, so Tailwind's "/20" alpha modifier can't apply to them;
// the accent tint uses the --app-accent-rgb triplet instead and the other pills are solid.
const buttonBase =
  "flex h-12 cursor-pointer items-center justify-center rounded-full text-[15px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2 focus-visible:ring-offset-app-surface"

/**
 * One layer of the surface. React 18 doesn't know `inert` as a prop, so it's
 * toggled on the element: a hidden layer can't take focus or be read out.
 */
function ContentLayer({ children, isVisible, className }: { children: ReactNode; isVisible: boolean; className?: string }) {
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.toggleAttribute("inert", !isVisible)
  }, [isVisible])

  return (
    <motion.div
      ref={ref}
      aria-hidden={!isVisible}
      initial={false}
      animate={{ opacity: isVisible ? 1 : 0, scale: isVisible || reduceMotion ? 1 : 0.95 }}
      transition={reduceMotion ? { duration: 0.1 } : isVisible ? { duration: 0.22, delay: 0.08, ease: "easeOut" } : { duration: 0.15, ease: "easeIn" }}
      className={cn("absolute inset-0 flex items-center justify-center", isVisible ? "pointer-events-auto" : "pointer-events-none", className)}
    >
      {children}
    </motion.div>
  )
}

// Mask runs from the centre row outward, so the heaviest blur sits at the wheel's edge.
function BlurLayer({ blur, maskFrom, maskTo, side }: { blur: number; maskFrom: number; maskTo: number; side: "top" | "bottom" }) {
  const ramp = (maskTo - maskFrom) / 3
  const mask = `linear-gradient(to ${side}, transparent ${maskFrom}%, black ${maskFrom + ramp}%, black ${maskTo - ramp}%, transparent ${maskTo}%)`
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{ backdropFilter: `blur(${blur}px)`, WebkitBackdropFilter: `blur(${blur}px)`, maskImage: mask, WebkitMaskImage: mask }}
    />
  )
}
const BLUR_BANDS = [
  { blur: 2, maskFrom: 0, maskTo: 35 },
  { blur: 4, maskFrom: 30, maskTo: 65 },
  { blur: 7, maskFrom: 60, maskTo: 95 },
]

function SecondsPicker({ value, onChange }: { value: number; onChange: (seconds: number) => void }) {
  const bandHeight = `calc(50% - ${OPTION_ITEM_HEIGHT / 2}px)`
  return (
    <div className="relative min-w-0 flex-1 cursor-grab active:cursor-grabbing [&_[data-rwp]]:!cursor-grab [&_[data-rwp]]:active:!cursor-grabbing">
      <WheelPickerPrimitive.WheelPickerWrapper className="w-full">
        <WheelPickerPrimitive.WheelPicker<number>
          options={OPTIONS}
          value={value}
          onValueChange={onChange}
          infinite
          visibleCount={20}
          optionItemHeight={OPTION_ITEM_HEIGHT}
          dragSensitivity={4}
          scrollSensitivity={10}
          classNames={{
            optionItem: "!text-[32px] font-display font-semibold leading-none text-app-muted tabular-nums data-[disabled]:opacity-40",
            highlightWrapper: cn(
              "bg-app-surface2 text-app-text",
              "data-[rwp-focused]:ring-2 data-[rwp-focused]:ring-inset data-[rwp-focused]:ring-app-accent"
            ),
            highlightItem: "!text-[32px] font-display font-semibold leading-none text-app-text tabular-nums data-[disabled]:opacity-40",
          }}
        />
      </WheelPickerPrimitive.WheelPickerWrapper>

      <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: bandHeight }}>
        {BLUR_BANDS.map((band) => <BlurLayer key={band.blur} side="top" {...band} />)}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0" style={{ height: bandHeight }}>
        {BLUR_BANDS.map((band) => <BlurLayer key={band.blur} side="bottom" {...band} />)}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,var(--app-surface)_0%,transparent_22%,transparent_78%,var(--app-surface)_100%)]"
      />
    </div>
  )
}

/** Progress ring drawn as the surface's border, from the measured size so it fits any phone. */
function TimerBorder({ left, total, width, height, done }: { left: number; total: number; width: number; height: number; done: boolean }) {
  const reduceMotion = useReducedMotion()
  const clamped = total === 0 ? 0 : Math.min(1, Math.max(0, left / total))
  if (!width || !height) return null

  // Inset by half the stroke so it isn't clipped; starts at top centre, clockwise.
  const s = BORDER_STROKE / 2
  const r = Math.max(0, Math.min(SURFACE_RADIUS - s, height / 2 - s, width / 2 - s))
  const path = [
    `M ${width / 2} ${s}`,
    `H ${width - s - r}`,
    `A ${r} ${r} 0 0 1 ${width - s} ${s + r}`,
    `V ${height - s - r}`,
    `A ${r} ${r} 0 0 1 ${width - s - r} ${height - s}`,
    `H ${s + r}`,
    `A ${r} ${r} 0 0 1 ${s} ${height - s - r}`,
    `V ${s + r}`,
    `A ${r} ${r} 0 0 1 ${s + r} ${s}`,
    "Z",
  ].join(" ")

  return (
    <svg aria-hidden="true" width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" className="pointer-events-none absolute inset-0">
      <path d={path} stroke="var(--app-border)" strokeWidth={BORDER_STROKE} />
      <motion.path
        d={path}
        stroke={done ? "var(--app-good)" : "var(--app-accent)"}
        strokeWidth={BORDER_STROKE}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        initial={false}
        animate={{ strokeDashoffset: done ? 0 : 1 - clamped, opacity: done || clamped > 0 ? 1 : 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.25, ease: "linear" }}
      />
    </svg>
  )
}

export type RestTimerProps = {
  /** Seconds left; 0 or less means the rest is over and "Go" shows. */
  left: number
  total: number
  paused: boolean
  onPause: () => void
  onResume: () => void
  onSkip: () => void
  /** The client picked a new remaining time on the wheel. */
  onChange: (seconds: number) => void
}

export default function RestTimer({ left, total, paused, onPause, onResume, onSkip, onChange }: RestTimerProps) {
  const reduceMotion = useReducedMotion()
  const [mode, setMode] = useState<Mode>("running")
  const [picked, setPicked] = useState(() => snap(left))
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const restoreFocusRef = useRef(false)
  const done = left <= 0

  // The surface is as wide as its column and animates its height, so the
  // border is drawn from what's actually on screen rather than fixed pixels.
  useLayoutEffect(() => {
    const el = surfaceRef.current
    if (!el) return
    const read = () => setSize({ width: el.offsetWidth, height: el.offsetHeight })
    read()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The rest ran out while the wheel was open: show "Go" rather than a stale wheel.
  useEffect(() => {
    if (done) setMode("running")
  }, [done])

  // The layer that held focus just went inert, so hand keyboard focus to the new one.
  useEffect(() => {
    if (!restoreFocusRef.current) return
    restoreFocusRef.current = false
    surfaceRef.current?.querySelector<HTMLElement>(`[data-timer-layer="${mode}"] :is(button, [tabindex="0"])`)?.focus({ preventScroll: true })
  }, [mode])

  // detail === 0 means the click came from the keyboard.
  const trackFocus = (event: MouseEvent) => {
    restoreFocusRef.current = event.detail === 0
  }

  const openPicker = (event: MouseEvent) => {
    if (done) return
    trackFocus(event)
    setPicked(snap(left))
    setMode("picker")
  }
  const applyPicked = (event: MouseEvent) => {
    trackFocus(event)
    onChange(picked)
    setMode("running")
  }
  const closePicker = (event: MouseEvent) => {
    trackFocus(event)
    setMode("running")
  }

  const caption = done ? "Rest done" : paused ? "Paused" : "Rest"
  const clock = done ? "Go" : formatClock(left)

  return (
    <motion.div
      ref={surfaceRef}
      role="timer"
      aria-live="polite"
      aria-label={done ? "Rest done" : `${formatClock(left)} rest left${paused ? ", paused" : ""}`}
      initial={false}
      animate={{ height: SURFACE_HEIGHT[mode] }}
      transition={reduceMotion ? { duration: 0.15 } : SURFACE_SPRING}
      style={{ borderRadius: SURFACE_RADIUS }}
      className="relative w-full overflow-hidden bg-app-surface text-app-text shadow-lg"
    >
      <ContentLayer isVisible={mode === "running"}>
        <div data-timer-layer="running" className="relative flex h-full w-full items-center justify-between gap-2 px-4">
          <TimerBorder left={left} total={total} width={size.width} height={size.height} done={done} />

          <motion.button
            type="button"
            onClick={paused ? onResume : onPause}
            disabled={done}
            whileTap={{ scale: 0.96 }}
            aria-label={paused ? "Resume rest" : "Pause rest"}
            className={cn(
              buttonBase,
              "relative w-[84px] shrink-0 overflow-hidden disabled:opacity-40",
              paused ? "bg-app-good text-white" : "bg-[rgba(var(--app-accent-rgb),0.15)] text-app-accent"
            )}
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={paused ? "resume" : "pause"}
                initial={{ y: reduceMotion ? "0%" : "100%", opacity: 0 }}
                animate={{ y: "0%", opacity: 1 }}
                exit={{ y: reduceMotion ? "0%" : "-100%", opacity: 0 }}
                transition={reduceMotion ? { duration: 0.1 } : { type: "spring", stiffness: 500, damping: 35 }}
                className="block"
              >
                {paused ? "Resume" : "Pause"}
              </motion.span>
            </AnimatePresence>
          </motion.button>

          {/* The time is a button: tap it to adjust. */}
          <button
            type="button"
            onClick={openPicker}
            disabled={done}
            aria-label={done ? "Rest done" : `${formatClock(left)} left. Change rest`}
            className="relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-app-muted">{caption}</span>
            <span className={cn("font-display text-[40px] font-bold leading-none tabular-nums", done && "text-app-good")}>{clock}</span>
          </button>

          <motion.button
            type="button"
            onClick={onSkip}
            whileTap={{ scale: 0.96 }}
            aria-label="Skip rest"
            className={cn(buttonBase, "relative w-[72px] shrink-0 bg-app-surface2 text-app-text hover:bg-app-border")}
          >
            Skip
          </motion.button>
        </div>
      </ContentLayer>

      <ContentLayer isVisible={mode === "picker"}>
        <div data-timer-layer="picker" className="flex h-full w-full items-center gap-3 pl-3 pr-4">
          <SecondsPicker value={picked} onChange={setPicked} />
          <div className="flex w-[88px] shrink-0 flex-col gap-2">
            <motion.button
              type="button"
              onClick={applyPicked}
              whileTap={{ scale: 0.96 }}
              className={cn(buttonBase, "bg-app-good text-white")}
            >
              Set
            </motion.button>
            <motion.button
              type="button"
              onClick={closePicker}
              whileTap={{ scale: 0.96 }}
              className={cn(buttonBase, "h-11 bg-app-surface2 text-app-text hover:bg-app-border")}
            >
              Back
            </motion.button>
          </div>
        </div>
      </ContentLayer>
    </motion.div>
  )
}
