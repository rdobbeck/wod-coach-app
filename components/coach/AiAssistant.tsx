"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type { Change } from "@/lib/ai/assist"
import { createThreadWriter } from "@/lib/ai/thread-writer"

type Meter = { spent: number; cap: number; level: "ok" | "warn" | "capped" }
export type Msg = {
  role: "user" | "assistant"
  text: string
  changes?: Change[]
  warnings?: string[]
  dropped?: string[]
  picked?: boolean[]
  state?: "pending" | "applied" | "discarded"
  changeSetId?: string | null
  undone?: boolean
  applyNote?: string
  failed?: boolean
}

const EXAMPLES_COACH = [
  "Her shoulder is irritated. No overhead work for the next two weeks.",
  "He's travelling next week with only dumbbells and a bench.",
  "Squats have felt easy. Bump the next three weeks.",
]
const EXAMPLES_CLIENT = ["My shoulder is irritated. No overhead work for two weeks.", "I'm travelling next week with only dumbbells and a bench.", "Squats have felt easy. Bump the next three weeks."]

const day = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
const money = (n: number) => `$${n.toFixed(2)}`

const CHIP: Record<Change["action"], string> = {
  replace: "bg-[#e6eef9] text-[#2a5fa8]",
  modify: "bg-[#fbf0dc] text-[#7a4f08]",
  remove: "bg-[#fbe7e7] text-[#a3262b]",
  add: "bg-[#e2f3ea] text-[#1f6b45]",
}

function ChangeRow({ c, on, disabled, toggle }: { c: Change; on: boolean; disabled: boolean; toggle: () => void }) {
  return (
    <label className={`flex gap-2 rounded-lg px-2 py-1.5 ${disabled ? "" : "cursor-pointer hover:bg-[#f6f3ee]"}`}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={toggle} className="mt-1 h-4 w-4 shrink-0 accent-[#c1272d]" />
      <span className="min-w-0 text-sm">
        <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${CHIP[c.action]}`}>{c.action}</span>
        {c.action === "replace" && (
          <>
            <span className="text-[#857c70] line-through">{c.exercise}</span> <span aria-hidden>&rarr;</span> <span className="font-semibold">{c.newExercise}</span>
          </>
        )}
        {c.action === "add" && <span className="font-semibold">{c.newExercise}</span>}
        {c.action === "remove" && <span className="text-[#857c70] line-through">{c.exercise}</span>}
        {c.action === "modify" && <span className="font-semibold">{c.exercise}</span>}
        {c.newExercise && c.inLibrary === false && (
          <span className="ml-1.5 rounded bg-[#f1ede5] px-1.5 py-0.5 text-[10px] font-semibold text-[#6b6257]" title="This name is not in your exercise library, so it will have no demo video">
            no demo video
          </span>
        )}
        {c.newPrescription && c.action !== "remove" && <span className="mt-0.5 block font-mono text-xs text-[#16181d]">{c.newPrescription}</span>}
        {c.action === "modify" && c.currentPrescription && <span className="block font-mono text-[11px] text-[#857c70] line-through">{c.currentPrescription}</span>}
        {c.reason && <span className="block text-xs text-[#6b6257]">{c.reason}</span>}
      </span>
    </label>
  )
}

/**
 * The AI box: ask a question or describe a change, review the edits, apply or
 * undo. The coach sees it on a client's page; a client sees it on their own
 * Today page when their coach switched it on (viewer "client": first-person
 * copy, no spend meter, because the money is the coach's). `onFirstMessage`
 * fires once, when the first reply lands or a restored thread already has
 * messages, so a first-use hint beside the button knows to go away.
 */
export default function AiAssistant({
  clientId,
  clientName,
  meter: initial,
  viewer = "coach",
  onFirstMessage,
}: {
  clientId: string
  clientName: string
  meter: Meter
  viewer?: "coach" | "client"
  onFirstMessage?: () => void
}) {
  const isClient = viewer === "client"
  // Stable, so the thread-load effect below can list it; the latest callback is read through a ref.
  const onFirst = useRef(onFirstMessage)
  onFirst.current = onFirstMessage
  const announced = useRef(false)
  const announceFirst = useCallback(() => {
    if (announced.current) return
    announced.current = true
    onFirst.current?.()
  }, [])
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [meter, setMeter] = useState(initial)
  // Load bumps (same movement, same sets and reps, different intensity) apply on their own.
  const [auto, setAuto] = useState(true)
  const end = useRef<HTMLDivElement>(null)
  const first = clientName.split(" ")[0] || "this client"
  const whose = isClient ? "your" : `${first}'s`
  const about = isClient ? "your training" : first
  const examples = isClient ? EXAMPLES_CLIENT : EXAMPLES_COACH

  // The conversation lives in the database so a reload or a crash does not lose it.
  const [loaded, setLoaded] = useState(false)
  const lastSaved = useRef<Msg[] | null>(null)
  // One write in flight at a time, in order, so a slow save never lands after a later one.
  const writer = useRef(createThreadWriter(clientId))
  useEffect(() => {
    if (!open || loaded) return
    let cancelled = false
    fetch(`/api/ai/assist/thread?clientId=${encodeURIComponent(clientId)}`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => {
        if (cancelled || !Array.isArray(d.messages)) return
        // Never overwrite a conversation that started while the thread was loading.
        setMsgs((cur) => {
          if (cur.length) return cur
          lastSaved.current = d.messages
          return d.messages
        })
        if (d.messages.length) announceFirst()
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, loaded, clientId, announceFirst])

  const saveThread = (messages: Msg[]) => {
    void writer.current.save(messages.filter((m) => !m.failed)).then((ok) => {
      if (!ok) toast.error("Couldn't save this conversation")
    })
  }
  useEffect(() => {
    // Save on every change after the first load; the restore itself is not written back.
    if (!loaded || lastSaved.current === msgs) return
    lastSaved.current = msgs
    if (msgs.length === 0) return
    // "Applying…" is a moment, not a state worth keeping: the next change writes the result.
    if (msgs.some((m) => m.state === "applied" && !m.changeSetId && !m.undone)) return
    saveThread(msgs)
  }, [msgs, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const clearThread = async () => {
    const pending = msgs.some((m) => m.state === "pending")
    if (!window.confirm(pending ? "Clear this conversation? Unapplied edits will be dropped." : "Clear this conversation?")) return
    lastSaved.current = []
    setMsgs([])
    await writer.current.clear()
  }

  // Braces matter: newer Chrome returns a value from scrollIntoView, and an
  // effect that returns it would hand React a "cleanup" that is not a function.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" })
  }, [msgs, busy, open])
  useEffect(() => {
    try {
      if (localStorage.getItem("ai-auto-load") === "off") setAuto(false)
    } catch {}
  }, [])
  const toggleAuto = (v: boolean) => {
    setAuto(v)
    try {
      localStorage.setItem("ai-auto-load", v ? "on" : "off")
    } catch {}
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const patch = (i: number, p: Partial<Msg>) => setMsgs((m) => m.map((x, j) => (j === i ? { ...x, ...p } : x)))

  const send = async (text: string) => {
    const message = text.trim()
    if (!message || busy || !loaded) return
    const history = msgs.filter((m) => !m.failed).map((m) => ({ role: m.role, content: m.text }))
    setMsgs((m) => [...m, { role: "user", text: message }])
    setInput("")
    setBusy(true)
    const res = await fetch("/api/ai/assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, message, history }),
    }).catch(() => null)
    setBusy(false)
    const d = res ? await res.json().catch(() => ({})) : {}
    if (d.meter) setMeter(d.meter)
    if (!res?.ok) {
      setMsgs((m) => [
        ...m,
        {
          role: "assistant",
          text: d.error ?? "Could not reach the AI. Check your connection and try again.",
          failed: true,
        },
      ])
      return
    }
    const willAuto = auto && !!d.autoApply && !!d.changes?.length
    const idx = msgs.length + 1 // the reply lands right after the message just sent
    setMsgs((m) => [
      ...m,
      {
        role: "assistant",
        text: d.reply,
        changes: d.changes,
        warnings: d.warnings,
        dropped: d.dropped,
        picked: (d.changes ?? []).map(() => true),
        state: d.changes?.length ? (willAuto ? "applied" : "pending") : undefined,
        applyNote: willAuto ? "Applying load changes…" : undefined,
      },
    ])
    announceFirst()
    if (willAuto) await runApply(idx, d.changes, message, true)
  }

  const runApply = async (i: number, chosen: Change[], request: string, automatic = false) => {
    if (!chosen.length) return
    patch(i, { state: "applied", applyNote: "Applying…" })
    const res = await fetch("/api/ai/assist/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, request, changes: chosen }),
    }).catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok || !d.applied) {
      // Falls back to asking, so nothing is ever lost or half done.
      patch(i, { state: "pending", applyNote: undefined })
      toast.error(d.skipped?.[0] ?? d.error ?? "Nothing could be applied")
      return
    }
    const n = d.applied as number
    patch(i, {
      state: "applied",
      changeSetId: d.changeSetId,
      applyNote: automatic
        ? `Applied ${n} load ${n === 1 ? "change" : "changes"} automatically to ${whose} calendar.${d.skipped?.length ? ` ${d.skipped.length} skipped.` : ""}`
        : `Applied ${n} ${n === 1 ? "change" : "changes"} to ${whose} calendar.${d.skipped?.length ? ` ${d.skipped.length} skipped.` : ""}`,
    })
    router.refresh()
  }

  const apply = (i: number) => {
    const m = msgs[i]
    const chosen = (m.changes ?? []).filter((_, k) => m.picked?.[k])
    const request = [...msgs.slice(0, i)].reverse().find((x) => x.role === "user")?.text ?? ""
    return runApply(i, chosen, request)
  }

  const undo = async (i: number) => {
    const m = msgs[i]
    if (!m.changeSetId) return
    const res = await fetch("/api/ai/assist/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changeSetId: m.changeSetId }),
    }).catch(() => null)
    if (!res?.ok) return toast.error("Couldn't undo that")
    patch(i, {
      undone: true,
      applyNote: "Undone. Everything is back the way it was.",
    })
    router.refresh()
  }

  const pct = Math.min(100, (meter.spent / meter.cap) * 100)
  const bar = meter.level === "capped" ? "bg-[#c1272d]" : meter.level === "warn" ? "bg-[#c88c3c]" : "bg-[#3e8e5a]"

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={`fixed right-5 z-30 flex items-center gap-2 rounded-full px-5 py-3 font-display text-lg font-bold uppercase tracking-[0.06em] shadow-xl ${
            // The client app has a fixed bottom nav and a dark theme: sit above the nav, in the accent colour.
            isClient ? "bottom-[calc(5.5rem+env(safe-area-inset-bottom))] bg-[#c1272d] text-white" : "bottom-5 bg-[#16181d] text-[#f4f1ea]"
          }`}
          aria-label={`Ask AI about ${about}`}
        >
          <span aria-hidden>&#10022;</span> Ask AI
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-40 sm:inset-auto sm:bottom-5 sm:right-5 sm:top-5" role="dialog" aria-label="AI assistant">
          <div className="flex h-full w-full flex-col overflow-hidden bg-[#f4f2ed] shadow-2xl sm:w-[28rem] sm:rounded-2xl sm:border sm:border-[#e0dad0]">
            <div className="border-b border-[#e0dad0] bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-display text-xl font-bold leading-none text-[#16181d]">Ask AI</p>
                  <p className="text-xs text-[#6b6257]">About {about}. Nothing changes until you apply it.</p>
                </div>
                <div className="flex items-center gap-1">
                  {msgs.length > 0 && (
                    <button onClick={clearThread} className="rounded-full px-3 py-1 text-sm font-semibold text-[#6b6257]" aria-label="Clear">
                      Clear
                    </button>
                  )}
                  <button onClick={() => setOpen(false)} className="rounded-full px-3 py-1 text-sm font-semibold text-[#6b6257]" aria-label="Close">
                    Close
                  </button>
                </div>
              </div>
              {!isClient && (
                <div className="mt-2" title="Resets on the 1st">
                  <div className="flex justify-between text-[11px] text-[#6b6257]">
                    <span>AI spend this month</span>
                    <span className="font-semibold tabular-nums">
                      {money(meter.spent)} of ${meter.cap.toFixed(0)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#e7e2d9]">
                    <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )}
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-[#4a443c]">
                <input type="checkbox" checked={auto} onChange={(e) => toggleAuto(e.target.checked)} className="h-3.5 w-3.5 accent-[#c1272d]" />
                Apply load bumps automatically
                <span className="text-[#857c70]">(same exercise, sets and reps)</span>
              </label>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {!loaded && <p className="text-sm text-[#6b6257]">Loading&hellip;</p>}
              {loaded && !msgs.length && (
                <div className="space-y-2">
                  <p className="text-sm text-[#4a443c]">
                    {isClient
                      ? "Ask a question, or tell me what to change in your upcoming training. I can see your sessions, results and notes."
                      : `Ask a question, or tell me what to change in ${first}'s upcoming training. I can see their sessions, results and notes.`}
                  </p>
                  {examples.map((x) => (
                    <button key={x} onClick={() => send(x)} className="block w-full rounded-xl border border-[#e0dad0] bg-white px-3 py-2 text-left text-sm text-[#16181d] hover:border-[#c1272d]">
                      {x}
                    </button>
                  ))}
                </div>
              )}

              {msgs.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="ml-8 rounded-2xl rounded-br-md bg-[#16181d] px-3.5 py-2 text-sm text-[#f4f1ea]">
                    {m.text}
                  </div>
                ) : (
                  <div key={i} className="mr-4 space-y-2">
                    <div className={`rounded-2xl rounded-bl-md border px-3.5 py-2.5 text-sm ${m.failed ? "border-[#e8c3c2] bg-[#fbeceb] text-[#a3262b]" : "border-[#e0dad0] bg-white text-[#16181d]"}`}>
                      <p className="whitespace-pre-line">{m.text}</p>
                    </div>

                    {m.changes && m.changes.length > 0 && (
                      <div className="rounded-2xl border border-[#e0dad0] bg-white">
                        {Array.from(new Set(m.changes.map((c) => `${c.date}|${c.workoutName}`)))
                          .sort()
                          .map((g) => {
                            const [date, name] = g.split("|")
                            return (
                              <div key={g} className="border-b border-[#f0ece4] px-2 py-2 last:border-0">
                                <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-[#857c70]">
                                  {day(date)} &middot; {name}
                                </p>
                                {m.changes!.map((c, k) =>
                                  `${c.date}|${c.workoutName}` === g ? (
                                    <ChangeRow
                                      key={k}
                                      c={c}
                                      on={!!m.picked?.[k]}
                                      disabled={m.state !== "pending"}
                                      toggle={() =>
                                        patch(i, {
                                          picked: m.picked!.map((v, j) => (j === k ? !v : v)),
                                        })
                                      }
                                    />
                                  ) : null,
                                )}
                              </div>
                            )
                          })}

                        {m.state === "pending" && (
                          <div className="flex items-center gap-2 px-3 py-3">
                            <button
                              onClick={() => apply(i)}
                              disabled={!m.picked?.some(Boolean)}
                              className="pulse-cta flex-1 rounded-xl bg-[#c1272d] px-3 py-2.5 font-display text-base font-bold uppercase tracking-[0.06em] text-white disabled:opacity-50"
                            >
                              Apply {m.picked?.filter(Boolean).length} {m.picked?.filter(Boolean).length === 1 ? "change" : "changes"}
                            </button>
                            <button onClick={() => patch(i, { state: "discarded" })} className="rounded-xl border border-[#e0dad0] px-3 py-2.5 text-sm font-semibold text-[#6b6257]">
                              Discard
                            </button>
                          </div>
                        )}
                        {m.state === "discarded" && <p className="px-3 py-2.5 text-sm text-[#6b6257]">Discarded. Nothing was changed.</p>}
                        {m.state === "applied" && (
                          <div className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                            <span className={m.undone ? "text-[#6b6257]" : "font-semibold text-[#2f6b45]"}>{m.applyNote}</span>
                            {!m.undone && m.changeSetId && (
                              <button onClick={() => undo(i)} className="shrink-0 rounded-lg border border-[#e0dad0] px-3 py-1 text-xs font-semibold text-[#16181d]">
                                Undo
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {m.warnings && m.warnings.length > 0 && (
                      <div className="rounded-xl bg-[#fbf0dc] px-3 py-2 text-xs text-[#7a4f08]">
                        <p className="font-semibold">Worth a look</p>
                        <ul className="mt-0.5 list-disc pl-4">
                          {m.warnings.map((w, k) => (
                            <li key={k}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {m.dropped && m.dropped.length > 0 && <p className="px-1 text-xs text-[#857c70]">Left out: {m.dropped.join(" ")}</p>}
                  </div>
                ),
              )}
              {busy && <p className="mr-4 animate-pulse text-sm text-[#6b6257]">Working on it&hellip;</p>}
              <div ref={end} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void send(input)
              }}
              className="border-t border-[#e0dad0] bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
            >
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      void send(input)
                    }
                  }}
                  rows={2}
                  placeholder={meter.level === "capped" ? (isClient ? "Your coach's AI limit is used up for this month" : "Monthly AI limit reached") : "Ask a question or describe a change"}
                  disabled={meter.level === "capped" || !loaded}
                  className="block max-h-40 min-h-[3rem] flex-1 resize-none rounded-xl border border-[#ddd7cc] bg-[#faf8f4] px-3 py-2 text-base text-[#16181d] disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={busy || !loaded || !input.trim() || meter.level === "capped"}
                  className="h-12 rounded-xl bg-[#16181d] px-4 font-display text-base font-bold uppercase tracking-[0.06em] text-[#f4f1ea] disabled:opacity-40"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
