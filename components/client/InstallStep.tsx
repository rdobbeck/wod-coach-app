'use client'

import { useEffect, useReducer, useState } from "react"
import { ARROW_SPOTS, canPromptInstall, onInstallChange, promptInstall, wasInstalled, type InstallBrowser } from "@/lib/install-prompt"

/**
 * The tour's last step on a phone: how to put WOD on the Home Screen in the
 * browser they're actually using, with a bouncing arrow at that browser's own
 * Share or menu button. Android Chrome gets a one-tap Install button instead
 * when it has offered one (lib/install-prompt).
 */
const Glyph = ({ children }: { children: React.ReactNode }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

const SHARE = <Glyph><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></Glyph>
const ADD = <Glyph><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" /></Glyph>
const MORE = <Glyph><circle cx="5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="19" cy="12" r="1.2" fill="currentColor" /></Glyph>
const MENU = <Glyph><circle cx="12" cy="5" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="19" r="1.2" fill="currentColor" /></Glyph>
const COMPASS = <Glyph><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></Glyph>

const b = (t: string) => <span className="font-semibold text-app-text">{t}</span>

const STEPS: Record<Exclude<InstallBrowser, "desktop">, [React.ReactNode, React.ReactNode][]> = {
  "ios-safari": [
    [MORE, <>Tap {b("···")} in the bottom bar, then {b("Share")}</>],
    [ADD, <>Choose {b("Add to Home Screen")}. Tap {b("View More")} if you don&rsquo;t see it</>],
  ],
  "ios-safari-legacy": [
    [SHARE, <>Tap {b("Share")} in the bottom bar</>],
    [ADD, <>Scroll down and choose {b("Add to Home Screen")}</>],
  ],
  "ios-chrome": [
    [SHARE, <>Tap {b("Share")} at the right of the address bar</>],
    [ADD, <>Choose {b("Add to Home Screen")}</>],
  ],
  "ios-other": [
    [COMPASS, <>Open this page in {b("Safari")} (copy the link from this browser&rsquo;s menu)</>],
    [ADD, <>Tap {b("Share")}, then {b("Add to Home Screen")}</>],
  ],
  "android-chrome": [
    [MENU, <>Tap {b("⋮")} at the top right</>],
    [ADD, <>Choose {b("Add to Home screen")} or {b("Install app")}</>],
  ],
  "android-other": [
    [MENU, <>Open your browser&rsquo;s menu</>],
    [ADD, <>Choose {b("Add to Home screen")} or {b("Install")}</>],
  ],
}

/** True when the arrow sits at the bottom, so the tour card has to move up out of its way. */
export const arrowAtBottom = (browser: InstallBrowser) => ARROW_SPOTS[browser]?.dir === "down"

export function InstallStepBody({ browser }: { browser: Exclude<InstallBrowser, "desktop"> }) {
  // Chrome's prompt can arrive after the tour opens; re-render when it does.
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  const [busy, setBusy] = useState(false)
  useEffect(() => onInstallChange(refresh), [])

  if (wasInstalled()) {
    return <p>Done. Open WOD from your Home Screen from now on.</p>
  }

  if (browser.startsWith("android") && canPromptInstall()) {
    return (
      <>
        <p>Open it in one tap, full screen, and get notified the moment your coach replies.</p>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await promptInstall().catch(() => false)
            setBusy(false)
          }}
          className="mt-4 flex h-11 items-center gap-2 rounded-xl border border-app-accent px-4 text-sm font-semibold text-app-accent disabled:opacity-50"
        >
          {ADD}
          Install WOD
        </button>
      </>
    )
  }

  const spot = ARROW_SPOTS[browser]
  return (
    <>
      <p>Open it in one tap, full screen, and get notified the moment your coach replies.</p>
      <ol className="mt-4 space-y-3">
        {STEPS[browser].map(([icon, text], n) => (
          <li key={n} className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-app-surface2 text-app-text">{icon}</span>
            <span>{text}</span>
          </li>
        ))}
      </ol>
      {spot && (
        <div aria-hidden="true" className="pointer-events-none fixed z-10 animate-bounce text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]" style={spot.style}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={spot.dir === "up" ? { transform: "rotate(180deg)" } : undefined}>
            <path d="M12 3v16M5 12l7 7 7-7" />
          </svg>
        </div>
      )}
    </>
  )
}
