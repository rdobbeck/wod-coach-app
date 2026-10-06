'use client'

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { MAX_BYTES } from "@/lib/uploads-shared"
import { MAX_SHOTS } from "@/lib/bug-reports-shared"

type Shot = { file: File; preview: string }

const IMAGE_MIME = ["image/jpeg", "image/png", "image/heic", "image/webp"]

/**
 * Report a problem: what happened, plus screenshots from the camera roll.
 *
 * On iPhone the client takes a normal screenshot first (side button + volume
 * up), then taps Add screenshot and picks it. A web page can't capture its own
 * screen on iOS, so that two-step is the honest flow. Where they were, their
 * phone and whether the app is installed are filled in without asking.
 */
export default function BugReportForm() {
  const params = useSearchParams()
  const [body, setBody] = useState("")
  const [shots, setShots] = useState<Shot[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // The page they came from: passed explicitly by the crash screen or the
  // Settings button, else the referrer, else unknown.
  const from = params.get("from") || (typeof document !== "undefined" && document.referrer ? safePath(document.referrer) : null)

  useEffect(() => () => shots.forEach((s) => URL.revokeObjectURL(s.preview)), [shots])

  const pick = (files: FileList | null) => {
    if (!files) return
    setError(null)
    const next: Shot[] = []
    for (const file of Array.from(files)) {
      if (!IMAGE_MIME.includes(file.type)) {
        setError("Screenshots need to be images")
        continue
      }
      if (file.size > MAX_BYTES) {
        setError("That image is too big")
        continue
      }
      next.push({ file, preview: URL.createObjectURL(file) })
    }
    setShots((s) => [...s, ...next].slice(0, MAX_SHOTS))
    if (fileRef.current) fileRef.current.value = ""
  }

  const drop = (i: number) =>
    setShots((s) => {
      URL.revokeObjectURL(s[i].preview)
      return s.filter((_, j) => j !== i)
    })

  /** Straight to storage with a one-shot token; the file never hits our server. */
  const uploadAll = async () => {
    const paths: string[] = []
    for (const { file } of shots) {
      const signed = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mime: file.type, size: file.size }),
      })
      if (!signed.ok) throw new Error((await signed.json().catch(() => ({}))).error ?? "Upload failed")
      const { path, signedUrl } = (await signed.json()) as { path: string; signedUrl: string }
      const put = await fetch(signedUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file })
      if (!put.ok) throw new Error("Couldn't upload the screenshot")
      paths.push(path)
    }
    return paths
  }

  const submit = async () => {
    if (!body.trim() && !shots.length) {
      setError("Tell us what happened, or add a screenshot")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const screenshots = await uploadAll()
      const res = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          path: from,
          userAgent: navigator.userAgent,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          installed: window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true,
          screenshots,
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't send that")
      setSent(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 rounded-2xl border border-app-border bg-app-surface p-5 text-center" data-testid="bug-report-sent">
        <p className="font-display text-2xl font-bold">Got it</p>
        <p className="text-sm text-app-muted">Ryan will take a look. Thanks for flagging it.</p>
        <a href="/client" className="block w-full rounded-xl bg-app-accent py-3 font-display text-sm font-bold uppercase tracking-[0.06em] text-app-accent-text">
          Back to Today
        </a>
      </div>
    )
  }

  const input = "w-full rounded-xl border border-app-border bg-app-surface2 px-3 py-3 text-sm text-app-text placeholder:text-app-muted"

  return (
    <div className="space-y-4">
      <label className="block space-y-2">
        <span className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-app-muted">What happened?</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="What were you trying to do, and what did the app do instead?"
          className={input}
          data-testid="bug-report-body"
        />
      </label>

      <div className="space-y-2">
        <span className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-app-muted">Screenshots</span>
        {shots.length > 0 && (
          <div className="flex gap-2">
            {shots.map((s, i) => (
              <div key={s.preview} className="relative">
                <img src={s.preview} alt="" className="h-24 w-16 rounded-lg border border-app-border object-cover" />
                <button
                  type="button"
                  onClick={() => drop(i)}
                  aria-label="Remove screenshot"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-app-accent text-xs font-bold text-app-accent-text"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {shots.length < MAX_SHOTS && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-xl border border-dashed border-app-border px-4 py-3 text-sm font-semibold text-app-text"
          >
            {shots.length ? "Add another screenshot" : "Add a screenshot"}
          </button>
        )}
        <input ref={fileRef} type="file" accept={IMAGE_MIME.join(",")} multiple onChange={(e) => pick(e.target.files)} className="hidden" data-testid="bug-report-file" />
        <p className="text-xs text-app-muted">On iPhone: press the side button and volume up together, then pick it from your photos here.</p>
      </div>

      {error && (
        <p className="text-sm font-semibold text-app-accent" role="alert" data-testid="bug-report-error">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="w-full rounded-xl bg-app-accent py-3 font-display text-sm font-bold uppercase tracking-[0.06em] text-app-accent-text disabled:opacity-50"
        data-testid="bug-report-send"
      >
        {busy ? "Sending…" : "Send to Ryan"}
      </button>
      {from && <p className="text-center text-xs text-app-muted">We'll include that you were on {from}.</p>}
    </div>
  )
}

/** Path and query of a same-site URL; null for anything else. */
function safePath(url: string) {
  try {
    const u = new URL(url)
    return u.origin === location.origin ? u.pathname + u.search : null
  } catch {
    return null
  }
}
