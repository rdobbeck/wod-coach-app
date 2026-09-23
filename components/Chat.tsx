'use client'

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

export type ChatMessage = { id: string; mine: boolean; body: string; at: string }

const stamp = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

/**
 * One conversation between a coach and a client. The coach passes the client's
 * id; a client leaves it out and the server resolves their coach.
 */
export default function Chat({
  initial,
  otherName,
  clientId,
  tone = "client",
}: {
  initial: ChatMessage[]
  otherName: string
  clientId?: string
  tone?: "client" | "coach"
}) {
  const [messages, setMessages] = useState(initial)
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" })
  }, [messages.length])

  // Pick up the other side's replies while the thread is open.
  useEffect(() => {
    const poll = setInterval(async () => {
      if (document.hidden) return
      const res = await fetch(`/api/messages${clientId ? `?clientId=${clientId}` : ""}`)
      if (!res.ok) return
      const { messages: fresh } = (await res.json()) as { messages: ChatMessage[] }
      setMessages((cur) => (fresh.length === cur.length ? cur : fresh))
    }, 20_000)
    return () => clearInterval(poll)
  }, [clientId])

  const s =
    tone === "client"
      ? {
          mine: "ml-auto bg-app-accent text-app-accent-text",
          theirs: "bg-app-surface2 text-app-text",
          meta: "text-[11px] text-app-muted",
          input: "min-h-[46px] w-full rounded-xl border border-app-border bg-app-surface2 px-3 py-3 text-sm text-app-text placeholder:text-app-muted",
          send: "h-12 shrink-0 rounded-xl bg-app-accent px-5 font-display text-sm font-bold uppercase tracking-[0.06em] text-app-accent-text disabled:opacity-50",
        }
      : {
          mine: "ml-auto bg-gray-900 text-white",
          theirs: "bg-gray-100 text-gray-900",
          meta: "text-[11px] text-gray-400",
          input: "min-h-[46px] w-full rounded-lg border border-gray-300 px-3 py-3 text-sm",
          send: "h-12 shrink-0 rounded-lg bg-gray-900 px-5 text-sm font-semibold text-white disabled:opacity-50",
        }

  const send = async () => {
    const text = body.trim()
    if (!text) return
    setBusy(true)
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text, clientId }),
    })
    setBusy(false)
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't send that")
    const { message } = (await res.json()) as { message: ChatMessage }
    setMessages((m) => [...m, message])
    setBody("")
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex-1 space-y-2 overflow-y-auto">
        {messages.length === 0 && (
          <p className={`${s.meta} py-8 text-center`}>No messages yet. Say hi to {otherName}.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="space-y-0.5">
            <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${m.mine ? s.mine : s.theirs}`}>
              {m.body}
            </p>
            <p className={`${s.meta} ${m.mine ? "text-right" : ""}`}>{stamp(m.at)}</p>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send()
          }}
          rows={1}
          placeholder={`Message ${otherName}`}
          className={s.input}
        />
        <button onClick={send} disabled={busy || !body.trim()} className={s.send}>
          Send
        </button>
      </div>
    </div>
  )
}
