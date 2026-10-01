'use client'

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

type Row = { id: string; label: string; url: string }

const blank = (): Row => ({ id: `new-${Math.random().toString(36).slice(2)}`, label: "", url: "" })

/**
 * Where the coach trains clients in person. Each place has its own scheduling
 * link, so the client picks the place first and then a time on that link. The
 * text number is the "just text me" way of setting up a session.
 */
export default function SessionLocations({ locations, textNumber, classFeedUrl }: { locations: Row[]; textNumber: string; classFeedUrl: string }) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>(locations.length ? locations : [blank()])
  const [phone, setPhone] = useState(textNumber)
  const [feed, setFeed] = useState(classFeedUrl)
  const [busy, setBusy] = useState(false)

  const edit = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const remove = (id: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : [blank()]))

  const save = async () => {
    setBusy(true)
    const res = await fetch("/api/coach/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionLocations: rows.map(({ label, url }) => ({ label, url })), textNumber: phone, classFeedUrl: feed }),
    })
    setBusy(false)
    if (!res.ok) {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string }
      return toast.error(error ?? "Couldn't save")
    }
    const any = rows.some((r) => r.label.trim() || r.url.trim()) || phone.trim() || feed.trim()
    toast.success(any ? "Clients can book a session" : "Session booking hidden from clients")
    router.refresh()
  }

  return (
    <div data-testid="session-locations" className="rounded-2xl border border-[#e4dfd5] bg-white p-4">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-[#857c70]">Where clients train</p>
      <p className="mt-2 text-sm text-[#4a443c]">
        Each place gets its own scheduling link. Clients get a &ldquo;Book a session&rdquo; card on Today, pick the place, then
        a time. Cal.com and Calendly links embed; anything else opens in a new tab.
      </p>

      <div className="mt-3 space-y-2">
        {rows.map((r, i) => (
          <div key={r.id} className="flex flex-col gap-2 rounded-xl border border-[#eee9df] p-2 sm:flex-row sm:items-center">
            <input
              value={r.label}
              onChange={(e) => edit(r.id, { label: e.target.value })}
              placeholder="Gym Pod"
              aria-label={`Place ${i + 1} name`}
              maxLength={40}
              className="rounded-xl border border-[#ddd7cc] px-3 py-2 text-base text-[#16181d] sm:w-48"
            />
            <input
              type="url"
              inputMode="url"
              value={r.url}
              onChange={(e) => edit(r.id, { url: e.target.value })}
              placeholder="https://cal.com/you/gym-pod"
              aria-label={`Place ${i + 1} scheduling link`}
              className="min-w-0 flex-1 rounded-xl border border-[#ddd7cc] px-3 py-2 text-base text-[#16181d]"
            />
            <button
              type="button"
              onClick={() => remove(r.id)}
              disabled={busy}
              aria-label={`Remove place ${i + 1}`}
              className="shrink-0 rounded-xl border border-[#ddd7cc] px-3 py-2 text-sm text-[#6b6257]"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows((rs) => [...rs, blank()])}
        disabled={busy || rows.length >= 8}
        className="mt-2 rounded-xl border border-[#ddd7cc] px-4 py-2 text-sm font-semibold text-[#16181d] disabled:opacity-40"
      >
        Add a place
      </button>

      <div className="mt-4">
        <p className="text-sm text-[#6b6257]">Or they text you</p>
        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(773) 491-7926"
          className="mt-1 w-full rounded-xl border border-[#ddd7cc] px-3 py-2 text-base text-[#16181d] sm:w-64"
        />
        <p className="mt-1 text-xs text-[#857c70]">
          Shown as a &ldquo;Text me to set up a time&rdquo; button next to the places. Leave it empty to hide it.
        </p>
      </div>

      <div className="mt-4">
        <p className="text-sm text-[#6b6257]">Class schedule feed</p>
        <input
          type="url"
          inputMode="url"
          value={feed}
          onChange={(e) => setFeed(e.target.value)}
          placeholder="https://raw.githubusercontent.com/you/classes/main/docs/classes.json"
          className="mt-1 w-full rounded-xl border border-[#ddd7cc] px-3 py-2 text-base text-[#16181d]"
        />
        <p className="mt-1 text-xs text-[#857c70]">
          Group classes you teach, as a JSON feed of weeks and classes. They&rsquo;re listed under the places, each with its
          own booking link. Leave it empty if you don&rsquo;t teach classes.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="mt-4 rounded-xl bg-[#16181d] px-4 py-2 text-sm font-semibold text-[#f4f1ea] disabled:opacity-40"
      >
        Save places
      </button>
    </div>
  )
}
