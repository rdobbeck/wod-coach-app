'use client'

import { useState } from "react"
import AiAssistant from "@/components/coach/AiAssistant"
import Hint from "@/components/client/Hint"

type Meter = { spent: number; cap: number; level: "ok" | "warn" | "capped" }

/**
 * The client's Ask AI button plus a one-time card explaining it. The card goes
 * on its own after their first message, and never shows to someone who already
 * has a saved conversation (`hasThread`, read on the server: the panel only
 * loads the thread once it is opened, so it cannot tell us in time).
 */
export default function AskAiHint({
  clientId,
  clientName,
  coachName,
  meter,
  hasThread,
}: {
  clientId: string
  clientName: string
  coachName: string | null
  meter: Meter
  hasThread: boolean
}) {
  const [used, setUsed] = useState(false)
  return (
    <>
      {/* Extra room below the card so the floating button never sits on it when Today is scrolled to the end. */}
      {!hasThread && (
        <div className="mb-8 mt-4">
          <Hint id="ask-ai" done={used}>
            New: the red <span className="font-semibold">Ask AI</span> button. Tell it what&apos;s going on and it reshapes your upcoming sessions.
            Nothing changes until you tap Apply, and {coachName ?? "your coach"} can undo anything.
          </Hint>
        </div>
      )}
      <AiAssistant clientId={clientId} clientName={clientName} meter={meter} viewer="client" onFirstMessage={() => setUsed(true)} />
    </>
  )
}
