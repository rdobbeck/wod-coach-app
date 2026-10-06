/**
 * "Add to Home Screen" support for the tour's install step.
 *
 * Android Chrome fires `beforeinstallprompt` once, early in the page's life, and
 * a listener added later misses it. initInstallPrompt() is called from the root
 * layout (components/InstallPromptInit) so the event is caught before the tour's
 * code even loads; the step then offers a one-tap Install button. Everywhere
 * else the step shows the browser's own steps with an arrow at its button.
 */
import type { CSSProperties } from "react"
import { isStandalone } from "./push-client"

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

let deferred: InstallEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function initInstallPrompt() {
  if (typeof window === "undefined" || (window as { __wodInstallInit?: boolean }).__wodInstallInit) return
  ;(window as { __wodInstallInit?: boolean }).__wodInstallInit = true
  window.addEventListener("beforeinstallprompt", (e) => {
    // Hold Chrome's mini-infobar back; the tour asks at a better moment.
    e.preventDefault()
    deferred = e as InstallEvent
    emit()
  })
  window.addEventListener("appinstalled", () => {
    installed = true
    deferred = null
    emit()
  })
}

/** Re-renders a component when the install prompt arrives or the app gets installed. */
export function onInstallChange(cb: () => void) {
  listeners.add(cb)
  return () => void listeners.delete(cb)
}

export const canPromptInstall = () => !!deferred
export const wasInstalled = () => installed

/** Shows Chrome's install dialog. True if they installed. */
export async function promptInstall() {
  const e = deferred
  if (!e) return false
  deferred = null
  await e.prompt()
  const { outcome } = await e.userChoice
  emit()
  return outcome === "accepted"
}

export type InstallBrowser =
  | "ios-safari" // iOS 26+: Share lives behind the ··· button in the Compact tab bar
  | "ios-safari-legacy" // iOS 18 and earlier: Share sits in the middle of the bottom bar
  | "ios-chrome"
  | "ios-other" // Firefox, Edge, and in-app browsers (Instagram, Gmail...) that can't install
  | "android-chrome"
  | "android-other"
  | "desktop"

export function detectBrowser(): InstallBrowser {
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac; touch gives it away.
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  if (iOS) {
    if (/CriOS/.test(ua)) return "ios-chrome"
    if (/FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Instagram|GSA\/|Line\//.test(ua) || !/Safari/.test(ua)) return "ios-other"
    // The OS version in Safari's UA is frozen at 18; the Safari version is not.
    const version = Number(/Version\/(\d+)/.exec(ua)?.[1] ?? 0)
    return version >= 26 ? "ios-safari" : "ios-safari-legacy"
  }
  if (/Android/.test(ua)) {
    return /Chrome\//.test(ua) && !/SamsungBrowser|Firefox|EdgA|OPR|; wv\)/.test(ua) ? "android-chrome" : "android-other"
  }
  return "desktop"
}

/** Phones in a browser only. Desktop, and anyone already in the installed app, never see it. */
export function shouldShowInstallStep() {
  if (typeof window === "undefined") return false
  return detectBrowser() !== "desktop" && !isStandalone() && !installed
}

/**
 * Where the arrow sits, aimed at the browser's own button (which lives outside
 * the page, so the arrow points off the edge of the viewport toward it).
 * Check these on a real phone; toolbars move between browser versions.
 */
export const ARROW_SPOTS: Partial<Record<InstallBrowser, { style: CSSProperties; dir: "up" | "down" }>> = {
  // iOS 26 Compact tab bar: ··· is the right-hand button of the floating bar.
  "ios-safari": { style: { bottom: "calc(env(safe-area-inset-bottom) + 6px)", right: 18 }, dir: "down" },
  "ios-safari-legacy": { style: { bottom: "calc(env(safe-area-inset-bottom) + 6px)", left: "50%", marginLeft: -20 }, dir: "down" },
  // Chrome on iPhone: Share is at the right end of the address bar, top of the screen.
  "ios-chrome": { style: { top: "calc(env(safe-area-inset-top) + 6px)", right: 16 }, dir: "up" },
  // Chrome on Android: the ⋮ menu, top right.
  "android-chrome": { style: { top: 6, right: 4 }, dir: "up" },
}
