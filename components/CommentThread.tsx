'use client'

import { useRef, useState } from "react"
import { toast } from "sonner"
import AttachmentView, { type Attached } from "@/components/AttachmentView"
import { ALLOWED_MIME, MAX_BYTES } from "@/lib/uploads-shared"

export type Comment = {
  id: string
  author: string
  body: string
  at?: string
  mine?: boolean
  attachments?: Attached[]
}

/** A file chosen but not sent yet. */
type Pending = { file: File; preview: string }

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
  const [pending, setPending] = useState<Pending[]>([])
  const fileInput = useRef<HTMLInputElement>(null)

  const pick = (list: FileList | null) => {
    const chosen = Array.from(list ?? []).slice(0, 4 - pending.length)
    const good: Pending[] = []
    for (const file of chosen) {
      if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
        toast.error(`${file.name}: that file type isn't supported`)
        continue
      }
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name}: files need to be under 50MB`)
        continue
      }
      good.push({ file, preview: URL.createObjectURL(file) })
    }
    setPending((p) => [...p, ...good])
    if (fileInput.current) fileInput.current.value = ""
  }

  const drop = (i: number) =>
    setPending((p) => {
      URL.revokeObjectURL(p[i].preview)
      return p.filter((_, j) => j !== i)
    })

  /** Straight to storage with a one-shot token; the file never hits our server. */
  const uploadAll = async () => {
    const done: { path: string; mime: string; size: number }[] = []
    for (const { file } of pending) {
      const signed = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mime: file.type, size: file.size }),
      })
      if (!signed.ok) throw new Error((await signed.json().catch(() => ({}))).error ?? "Upload failed")
      const { path, signedUrl } = (await signed.json()) as { path: string; signedUrl: string }
      const put = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      })
      if (!put.ok) throw new Error(`Couldn't upload ${file.name}`)
      done.push({ path, mime: file.type, size: file.size })
    }
    return done
  }

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
    if (!text && !pending.length) return
    setBusy(true)
    try {
      const attachments = await uploadAll()
      const res = await fetch(`/api/workouts/${workoutId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, attachments }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't post that")
      const { comment } = (await res.json()) as { comment: Comment }
      setComments((c) => [...c, { ...comment, mine: true }])
      setBody("")
      pending.forEach((p) => URL.revokeObjectURL(p.preview))
      setPending([])
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
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
              {c.body && <p className="mt-0.5 whitespace-pre-wrap text-sm">{c.body}</p>}
              {c.attachments?.length ? <AttachmentView items={c.attachments} /> : null}
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {pending.map((p, i) => (
            <li key={i} className="relative">
              <span className="block h-16 w-16 overflow-hidden rounded-lg bg-black/40">
                {p.file.type.startsWith("video/") ? (
                  <video src={p.preview} className="h-full w-full object-cover" muted playsInline />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.preview} alt="" className="h-full w-full object-cover" />
                )}
              </span>
              <button
                onClick={() => drop(i)}
                aria-label="Remove"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/80 text-xs text-white"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-end gap-2">
        <input
          ref={fileInput}
          type="file"
          accept={ALLOWED_MIME.join(",")}
          multiple
          className="hidden"
          onChange={(e) => pick(e.target.files)}
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={busy || pending.length >= 4}
          aria-label="Attach a photo or video"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-lg disabled:opacity-40 ${
            tone === "client" ? "border-app-border text-app-text" : "border-gray-300 text-gray-700"
          }`}
        >
          +
        </button>
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
        <button onClick={send} disabled={busy || (!body.trim() && !pending.length)} className={s.send}>
          {busy ? "Sending" : "Send"}
        </button>
      </div>
    </section>
  )
}
