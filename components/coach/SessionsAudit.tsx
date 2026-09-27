'use client'

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

export type ClientRow = {
  id: string
  name: string
  used: number | null
  size: number | null
  left: number | null
  packageDone: boolean
  estimated: boolean
  next: string | null // ISO
  paymentDue: boolean
  onCalendar: boolean
  active: boolean
}
export type ReviewRow = { id: string; title: string; startsAt: string; suggestion: string }

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

/** Refresh, the per-client counts, and the sessions that could not be matched to anyone. */
export function RefreshButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        const res = await post("/api/sessions/sync", {}).catch(() => null)
        const d = res ? await res.json().catch(() => ({})) : {}
        setBusy(false)
        if (!res?.ok) return toast.error(d.error ?? "Couldn't read the calendar")
        const r = d.report
        toast.success(`Read your calendar: ${r.matched} matched, ${r.needsReview} to review`)
        router.refresh()
      }}
      className="rounded-lg bg-[#16181d] px-4 py-2 text-sm font-semibold text-[#f4f1ea] disabled:opacity-60"
    >
      {busy ? "Reading…" : "Refresh from calendar"}
    </button>
  )
}

export function ClientTable({ rows }: { rows: ClientRow[] }) {
  const router = useRouter()
  const paid = async (id: string) => {
    const res = await post("/api/sessions/assign", { clientId: id, markPaid: true })
    if (!res.ok) return toast.error("Couldn't mark that paid")
    toast.success("Marked paid")
    router.refresh()
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#e4dfd5] bg-white">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead>
          <tr className="border-b border-[#f0ece4] text-[11px] uppercase tracking-[0.12em] text-[#857c70]">
            <th className="px-4 py-2.5 font-semibold">Client</th>
            <th className="px-4 py-2.5 font-semibold">Package</th>
            <th className="px-4 py-2.5 font-semibold">Next session</th>
            <th className="px-4 py-2.5 font-semibold">Payment</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f0ece4]">
          {rows.map((r) => (
            <tr key={r.id} className={r.active ? "" : "text-[#857c70]"}>
              <td className="px-4 py-2.5 font-semibold text-[#16181d]">
                <a href={`/coach/clients/${r.id}`} className="hover:underline">
                  {r.name}
                </a>
                {!r.active && <span className="ml-2 text-xs font-normal">inactive</span>}
              </td>
              <td className="px-4 py-2.5">
                {r.left != null && r.size != null ? (
                  <span>
                    <span className="font-semibold text-[#16181d]">
                      {r.left} of {r.size}
                    </span>{" "}
                    left{r.estimated ? " (est.)" : ""}
                    {r.packageDone && <span className="ml-1 rounded bg-[#fbf0dc] px-1.5 py-0.5 text-[11px] font-semibold text-[#7a4f08]">finished</span>}
                  </span>
                ) : r.onCalendar ? (
                  <span className="text-[#857c70]">no count in titles</span>
                ) : (
                  <span className="text-[#a79e91]">not on calendar</span>
                )}
              </td>
              <td className="px-4 py-2.5">{r.next ? when(r.next) : <span className="text-[#a79e91]">none booked</span>}</td>
              <td className="px-4 py-2.5">
                {r.paymentDue ? (
                  <span className="flex items-center gap-2">
                    <span className="rounded bg-[#fbe7e7] px-1.5 py-0.5 text-[11px] font-semibold text-[#a3262b]">due</span>
                    <button onClick={() => paid(r.id)} className="text-xs font-semibold text-[#c1272d]">
                      Mark paid
                    </button>
                  </span>
                ) : (
                  <span className="text-[#a79e91]">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ReviewList({ rows, clients }: { rows: ReviewRow[]; clients: { id: string; name: string }[] }) {
  const router = useRouter()
  const [pick, setPick] = useState<Record<string, string>>({})
  const [alias, setAlias] = useState<Record<string, string>>({})

  const assign = async (r: ReviewRow) => {
    const id = pick[r.id]
    if (!id) return toast.error("Pick who it is for")
    const res = await post("/api/sessions/assign", { eventId: r.id, clientIds: [id], alias: alias[r.id] || undefined })
    if (!res.ok) return toast.error("Couldn't assign that")
    toast.success(alias[r.id] ? `Assigned. "${alias[r.id]}" will match from now on.` : "Assigned")
    router.refresh()
  }
  const ignore = async (r: ReviewRow) => {
    const res = await post("/api/sessions/assign", { eventId: r.id, ignore: true })
    if (!res.ok) return toast.error("Couldn't hide that")
    router.refresh()
  }

  return (
    <ul className="divide-y divide-[#f0ece4] rounded-2xl border border-[#e4dfd5] bg-white">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1 basis-56">
            <p className="truncate text-sm font-semibold text-[#16181d]">{r.title}</p>
            <p className="text-xs text-[#857c70]">{when(r.startsAt)}</p>
          </div>
          <select
            aria-label={`Who is "${r.title}" for`}
            value={pick[r.id] ?? ""}
            onChange={(e) => setPick({ ...pick, [r.id]: e.target.value })}
            className="rounded-md border border-[#ddd7cc] bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Who is it for?</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            aria-label="Also match this word in future titles"
            placeholder="always match (optional)"
            value={alias[r.id] ?? ""}
            onChange={(e) => setAlias({ ...alias, [r.id]: e.target.value })}
            className="w-44 rounded-md border border-[#ddd7cc] bg-white px-2 py-1.5 text-sm"
          />
          <button onClick={() => assign(r)} className="rounded-md bg-[#16181d] px-3 py-1.5 text-sm font-semibold text-[#f4f1ea]">
            Assign
          </button>
          <button onClick={() => ignore(r)} className="text-sm font-semibold text-[#857c70]">
            Not a client session
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * Connect or change the coach's calendar. The saved address never comes back to
 * the browser; `connected` only says which service it is.
 */
export function CalendarFeed({ connected, editable }: { connected: string | null; editable: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(!connected)
  const [url, setUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined

  const save = async (value: string) => {
    setBusy(true)
    const res = await post("/api/sessions/feed", { url: value, tz }).catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res?.ok) return toast.error(d.error ?? "Couldn't connect that calendar")
    if (d.removed) toast.success("Calendar disconnected. Sessions already read are kept.")
    else if (d.report) toast.success(`Connected. ${d.report.matched} sessions matched to clients, ${d.report.needsReview} to review.`)
    else toast.success(`Connected, but the first read failed: ${d.warning}`)
    setUrl("")
    setOpen(false)
    router.refresh()
  }

  if (connected && !open) {
    return (
      <p className="text-sm text-[#6b6257]">
        Reading from {connected}.{" "}
        {editable && (
          <>
            <button onClick={() => setOpen(true)} className="font-semibold text-[#16181d] underline">
              Change
            </button>{" "}
            ·{" "}
            <button disabled={busy} onClick={() => save("")} className="font-semibold text-[#16181d] underline">
              Disconnect
            </button>
          </>
        )}
      </p>
    )
  }

  return (
    <section className="space-y-3 rounded-2xl border border-[#e4dfd5] bg-white p-5 text-sm text-[#4a443c]">
      <p className="font-display text-xl font-bold text-[#16181d]">Connect your calendar</p>
      <p>Sessions counts the training sessions on your calendar for each client, so you see packages running low and who owes you. It only reads; nothing is ever changed on your calendar.</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          <b>Google Calendar</b> on a computer: Settings, click your business calendar, then <b>Integrate calendar</b>. Copy the{" "}
          <b>Secret address in iCal format</b>.
        </li>
        <li>
          <b>Apple Calendar</b>: in iCloud Calendar on the web, share the calendar as a <b>Public Calendar</b> and copy the link.
        </li>
        <li>
          <b>Outlook</b>: Settings, Calendar, Shared calendars, <b>Publish a calendar</b>, and copy the ICS link.
        </li>
      </ol>
      <p className="text-xs text-[#857c70]">
        Anyone with this address can read that calendar, so paste it only here. It&rsquo;s encrypted when saved and never shown again.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (url.trim()) save(url.trim())
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input
          id="calendar-feed-url"
          type="password"
          autoComplete="off"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://calendar.google.com/calendar/ical/.../private-.../basic.ics"
          className="min-w-0 flex-1 rounded-lg border border-[#ddd7cc] px-3 py-2"
        />
        <button disabled={busy || !url.trim()} className="rounded-lg bg-[#16181d] px-4 py-2 font-semibold text-[#f4f1ea] disabled:opacity-50">
          {busy ? "Reading your calendar…" : "Connect"}
        </button>
        {connected && (
          <button type="button" onClick={() => setOpen(false)} className="px-2 font-semibold text-[#6b6257]">
            Cancel
          </button>
        )}
      </form>
    </section>
  )
}
