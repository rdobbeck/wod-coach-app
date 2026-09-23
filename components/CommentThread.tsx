'use client'

import { useState } from "react"
import { toast } from "sonner"

export type Comment = { id: string; author: string; body: string; at?: string; mine?: boolean }

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""

/**
 * The comment thread on a single workout, shared by both sides. `tone` picks
 * between the client app's themed tokens and the coach dashboard's plain look.
 */
export default function CommentThread({
  workoutId,
  initial,
  tone = "client",
  placeholder = "Add a comment",
}: {
  workoutId: string
  initial: Comment[]
  tone?: "client" | "coach"
  placeholder?: string
}) {
  const [comments, setComments] = useState(initial)
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)

  const s =
    tone === "client"
      ? {
          wrap: "rounded-2xl border border-app-border bg-app-surface p-4",
          head: "font-display text-sm font-semibold uppercase tracking-[0.14em] text-app-muted",
          bubble: "rounded-xl bg-app-surface2 px-3 py-2",
          author: "text-xs font-semibold text-app-accent",
          authorMine: "text-xs font-semibold text-app-muted",
          meta: "text-xs text-app-muted",
          input: "min-h-[44px] w-full rounded-xl border border-app-border bg-app-surface2 px-3 py-2 text-sm text-app-text placeholder:text-app-muted",
          send: "h-11 shrink-0 rounded-xl bg-app-accent px-4 font-display text-sm font-bold uppercase tracking-[0.06em] text-app-accent-text disabled:opacity-50",
        }
      : {
          wrap: "rounded-xl border border-gray-200 bg-white p-4",
          head: "text-xs font-semibold uppercase text-gray-500",
          bubble: "rounded-lg bg-gray-50 px-3 py-2",
          author: "text-xs font-semibold text-gray-900",
          authorMine: "text-xs font-semibold text-gray-500",
          meta: "text-xs text-gray-400",
          input: "min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm",
          send: "h-11 shrink-0 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white disabled:opacity-50",
        }

  const send = async () => {
    const text = body.trim()
    if (!text) return
    setBusy(true)
    const res = await fetch(`/api/workouts/${workoutId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    })
    setBusy(false)
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't post that")
    const { comment } = (await res.json()) as { comment: Comment }
    setComments((c) => [...c, { ...comment, mine: true }])
    setBody("")
  }

  return (
    <section className={s.wrap}>
      <h2 className={s.head}>Comments</h2>
      {comments.length > 0 && (
        <ul className="mt-3 space-y-2">
          {comments.map((c) => (
            <li key={c.id} className={s.bubble}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={c.mine ? s.authorMine : s.author}>{c.mine ? "You" : c.author}</span>
                <span className={s.meta}>{when(c.at)}</span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-sm">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send()
          }}
          rows={1}
          placeholder={placeholder}
          className={s.input}
        />
        <button onClick={send} disabled={busy || !body.trim()} className={s.send}>
          Send
        </button>
      </div>
    </section>
  )
}
