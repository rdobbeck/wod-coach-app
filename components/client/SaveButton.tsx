'use client'

/*
 * Save button with letter-by-letter label changes and a corner status dot.
 * Adapted from uselayouts "Save Button"
 * (https://github.com/iurvish/uselayouts, MIT License, Copyright (c) iurvish).
 * The demo faked its save with timers; this one is driven by a real async save
 * and hands off when it's done instead of resetting.
 */

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/cn"

type Status = "idle" | "saving" | "done" | "error"

export type SaveButtonProps = {
  label: string
  savingLabel?: string
  doneLabel?: string
  errorLabel?: string
  /** Resolve true once the save is stored. False, or a throw, shows the error state with a retry. */
  onSave: () => Promise<boolean>
  /** Called once the success state has had a moment on screen. */
  onDone: () => void
  /** How long "done" stays before onDone; long enough to see the tick. */
  doneDelayMs?: number
  className?: string
}

export default function SaveButton({
  label,
  savingLabel = "Saving",
  doneLabel = "Saved",
  errorLabel = "Couldn't save. Tap to retry.",
  onSave,
  onDone,
  doneDelayMs = 900,
  className,
}: SaveButtonProps) {
  const reduceMotion = useReducedMotion()
  const [status, setStatus] = useState<Status>("idle")
  // A second tap while a save is in flight does nothing, whatever `disabled` says.
  const busy = useRef(false)
  const doneTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(doneTimer.current), [])

  const save = async () => {
    if (busy.current) return
    busy.current = true
    setStatus("saving")
    let ok = false
    try {
      ok = await onSave()
    } catch {
      ok = false
    }
    if (!ok) {
      busy.current = false
      setStatus("error")
      return
    }
    setStatus("done")
    doneTimer.current = setTimeout(onDone, doneDelayMs)
  }

  const text = status === "idle" ? label : status === "saving" ? savingLabel : status === "done" ? doneLabel : errorLabel

  return (
    <div className="relative flex flex-1">
      <button
        type="button"
        onClick={save}
        disabled={status === "saving" || status === "done"}
        aria-label={text}
        aria-busy={status === "saving"}
        className={cn(
          "relative h-14 w-full rounded-xl font-display text-xl font-bold uppercase tracking-[0.06em] shadow-lg transition-colors duration-300 disabled:opacity-100",
          status === "idle" && "bg-app-accent text-app-accent-text",
          status === "saving" && "cursor-wait bg-app-surface2 text-app-muted",
          status === "done" && "bg-app-good text-white",
          status === "error" && "bg-app-accent text-base normal-case tracking-normal text-app-accent-text",
          className
        )}
      >
        <span className="flex items-center justify-center" aria-hidden="true">
          {reduceMotion ? (
            <span>{text}</span>
          ) : (
            <AnimatePresence mode="popLayout" initial={false}>
              {text.split("").map((char, i) => (
                <motion.span
                  key={`${char}-${i}`}
                  layout
                  initial={{ opacity: 0, scale: 0, filter: "blur(4px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 0, filter: "blur(4px)" }}
                  transition={{ type: "spring", stiffness: 500, damping: 30, mass: 1 }}
                  className="inline-block"
                >
                  {/* Each letter is its own inline-block, so a plain space would collapse. */}
                  {char === " " ? " " : char}
                </motion.span>
              ))}
            </AnimatePresence>
          )}
        </span>
      </button>

      {/* Status dot in the corner: spinner while saving, tick when stored, mark when it failed. */}
      <div className="pointer-events-none absolute -right-1 -top-1 z-10">
        <AnimatePresence mode="wait">
          {status !== "idle" && (
            <motion.div
              key="dot"
              initial={{ opacity: 0, scale: 0, x: -8, filter: "blur(4px)" }}
              animate={{ opacity: 1, scale: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0, x: -8, filter: "blur(4px)" }}
              transition={reduceMotion ? { duration: 0.1 } : { type: "spring", stiffness: 300, damping: 20 }}
              className={cn(
                "flex size-6 items-center justify-center overflow-visible rounded-full ring-[3px] ring-app-bg",
                status === "done" ? "bg-app-good text-white" : status === "error" ? "bg-app-warn text-white" : "bg-app-surface2 text-app-text"
              )}
            >
              <AnimatePresence mode="popLayout">
                {status === "saving" && (
                  <motion.div
                    key="loader"
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M12 2A10 10 0 1 0 22 12A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8A8 8 0 0 1 12 20Z" opacity=".5" />
                      <path fill="currentColor" d="M20 12h2A10 10 0 0 0 12 2V4A8 8 0 0 1 20 12Z">
                        {!reduceMotion && <animateTransform attributeName="transform" dur="1s" from="0 12 12" repeatCount="indefinite" to="360 12 12" type="rotate" />}
                      </path>
                    </svg>
                  </motion.div>
                )}
                {status === "done" && (
                  <motion.div
                    key="check"
                    initial={{ scale: 0, opacity: 0, filter: "blur(4px)" }}
                    animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                    exit={{ scale: 0, opacity: 0, filter: "blur(4px)" }}
                    transition={reduceMotion ? { duration: 0.1 } : { type: "spring", stiffness: 500, damping: 25 }}
                    className="absolute inset-0 flex items-center justify-center text-sm font-bold"
                  >
                    ✓
                  </motion.div>
                )}
                {status === "error" && (
                  <motion.div
                    key="bang"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="absolute inset-0 flex items-center justify-center text-sm font-bold"
                  >
                    !
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
