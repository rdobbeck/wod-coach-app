'use client'

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { dollars, METHOD_LABEL, type Method } from "@/lib/pay/money"

export type PendingRow = { id: string; client: string; description: string; amountCents: number; method: string; createdAt: string }
export type LedgerRow = { id: string; client: string; description: string; amountCents: number; method: string; status: string; createdAt: string }
export type ProductRow = { id: string; name: string; description: string | null; priceCents: number; sessions: number; active: boolean }

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
const send = (url: string, body: unknown, method = "POST") =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const input = "rounded-md border border-[#ddd7cc] bg-white px-2 py-1.5 text-sm"

/** Claims from clients that are waiting on you: money you have or have not seen arrive. */
export function PendingList({ rows }: { rows: PendingRow[] }) {
  const router = useRouter()
  const decide = async (id: string, confirm: boolean) => {
    const res = await send(`/api/payments/${id}`, { confirm }, "PATCH")
    if (!res.ok) return toast.error("Couldn't update that")
    toast.success(confirm ? "Confirmed" : "Marked as not received")
    router.refresh()
  }
  return (
    <ul className="divide-y divide-[#f0ece4] rounded-2xl border border-[#f0e3c4] bg-[#fdf8ec]">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1 basis-56">
            <p className="text-sm font-semibold text-[#16181d]">
              {r.client} says they sent {dollars(r.amountCents)} by {METHOD_LABEL[r.method as Method] ?? r.method}
            </p>
            <p className="text-xs text-[#6b5a2e]">
              {r.description} &middot; {day(r.createdAt)}
            </p>
          </div>
          <button onClick={() => decide(r.id, true)} className="rounded-md bg-[#16181d] px-3 py-1.5 text-sm font-semibold text-[#f4f1ea]">
            It arrived
          </button>
          <button onClick={() => decide(r.id, false)} className="text-sm font-semibold text-[#857c70]">
            Didn&apos;t get it
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Cash in hand, or a Venmo or transfer you already saw arrive. */
export function RecordForm({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter()
  const [f, setF] = useState({ clientId: "", amount: "", method: "CASH", description: "", date: "" })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    setBusy(true)
    const res = await send("/api/payments", { ...f, clientId: f.clientId || undefined, date: f.date || undefined })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return toast.error(d.error ?? "Couldn't save that")
    toast.success("Recorded")
    setF({ clientId: "", amount: "", method: "CASH", description: "", date: "" })
    router.refresh()
  }
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#e4dfd5] bg-white p-4">
      <label className="text-xs font-semibold text-[#6b6257]">
        Client
        <select aria-label="Client" value={f.clientId} onChange={set("clientId")} className={`${input} mt-1 block w-44`}>
          <option value="">Someone else</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-semibold text-[#6b6257]">
        Amount
        <input aria-label="Amount" inputMode="decimal" placeholder="100" value={f.amount} onChange={set("amount")} className={`${input} mt-1 block w-24`} />
      </label>
      <label className="text-xs font-semibold text-[#6b6257]">
        How
        <select aria-label="How it was paid" value={f.method} onChange={set("method")} className={`${input} mt-1 block`}>
          {(["CASH", "VENMO", "BANK", "OTHER"] as Method[]).map((m) => (
            <option key={m} value={m}>
              {METHOD_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-40 flex-1 text-xs font-semibold text-[#6b6257]">
        For
        <input aria-label="What it was for" placeholder="10-session package" value={f.description} onChange={set("description")} className={`${input} mt-1 block w-full`} />
      </label>
      <label className="text-xs font-semibold text-[#6b6257]">
        Date
        <input aria-label="Date" type="date" value={f.date} onChange={set("date")} className={`${input} mt-1 block`} />
      </label>
      <button onClick={save} disabled={busy || !f.amount || !f.description} className="rounded-md bg-[#16181d] px-4 py-2 text-sm font-semibold text-[#f4f1ea] disabled:opacity-50">
        Record
      </button>
    </div>
  )
}

export function Ledger({ rows }: { rows: LedgerRow[] }) {
  if (!rows.length) return <p className="rounded-2xl border border-dashed border-[#ddd7cc] p-5 text-sm text-[#857c70]">Nothing recorded yet.</p>
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#e4dfd5] bg-white">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead>
          <tr className="border-b border-[#f0ece4] text-[11px] uppercase tracking-[0.12em] text-[#857c70]">
            <th className="px-4 py-2.5 font-semibold">Date</th>
            <th className="px-4 py-2.5 font-semibold">Client</th>
            <th className="px-4 py-2.5 font-semibold">For</th>
            <th className="px-4 py-2.5 font-semibold">How</th>
            <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f0ece4]">
          {rows.map((r) => (
            <tr key={r.id} className={r.status === "REFUNDED" ? "text-[#a79e91] line-through" : ""}>
              <td className="px-4 py-2.5">{day(r.createdAt)}</td>
              <td className="px-4 py-2.5 font-semibold text-[#16181d]">{r.client}</td>
              <td className="px-4 py-2.5">{r.description}</td>
              <td className="px-4 py-2.5">{METHOD_LABEL[r.method as Method] ?? r.method}</td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                {dollars(r.amountCents)}
                {r.status === "REFUNDED" && <span className="ml-1 text-[11px] font-normal no-underline">refunded</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Prices, and how clients can pay you outside of card. */
export function PricesEditor({ products, venmo, instructions, cardReady }: { products: ProductRow[]; venmo: string; instructions: string; cardReady: boolean }) {
  const router = useRouter()
  const [draft, setDraft] = useState({ name: "", price: "", sessions: "1", description: "" })
  const [v, setV] = useState({ venmoHandle: venmo, payInstructions: instructions })

  const add = async () => {
    const res = await send("/api/products", { ...draft, sessions: Number(draft.sessions) || 1 })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(d.error ?? "Couldn't add that")
    setDraft({ name: "", price: "", sessions: "1", description: "" })
    router.refresh()
  }
  // One item open for editing at a time. Price is shown in dollars and stored in cents.
  const [editing, setEditing] = useState<string | null>(null)
  const [edit, setEdit] = useState({ name: "", price: "", sessions: "1", description: "" })
  const startEdit = (p: ProductRow) => {
    setEditing(p.id)
    setEdit({ name: p.name, price: String(p.priceCents / 100), sessions: String(p.sessions), description: p.description ?? "" })
  }
  const saveEdit = async () => {
    const res = await send("/api/products", { id: editing, ...edit, sessions: Number(edit.sessions) || 1 })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(d.error ?? "Couldn't save that")
    toast.success("Saved")
    setEditing(null)
    router.refresh()
  }

  const toggle = async (p: ProductRow) => {
    const res = await send("/api/products", { id: p.id, active: !p.active })
    if (!res.ok) return toast.error("Couldn't change that")
    router.refresh()
  }
  const seed = async () => {
    const res = await fetch("/api/products/seed", { method: "POST" })
    if (!res.ok) return toast.error("Couldn't add those")
    router.refresh()
  }
  const saveMethods = async () => {
    const res = await fetch("/api/coach/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(d.error ?? "Couldn't save that")
    toast.success("Saved")
    router.refresh()
  }

  return (
    <div className="space-y-5 rounded-2xl border border-[#e4dfd5] bg-white p-4">
      <div>
        <h3 className="font-display text-lg font-bold text-[#16181d]">What clients can buy</h3>
        {products.length === 0 ? (
          <p className="mt-1 text-sm text-[#6b6257]">
            Nothing yet.{" "}
            <button onClick={seed} className="font-semibold text-[#c1272d]">
              Add my usual prices
            </button>{" "}
            (first session $140, sessions $100, and 3, 5, 10 and 20 packs), then change them here.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[#f0ece4]">
            {products.map((p) =>
              editing === p.id ? (
                <li key={p.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs font-semibold text-[#6b6257]">
                      Name
                      <input aria-label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={`${input} mt-1 block w-52`} />
                    </label>
                    <label className="text-xs font-semibold text-[#6b6257]">
                      Price ($)
                      <input aria-label="Price" inputMode="decimal" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} className={`${input} mt-1 block w-28`} />
                    </label>
                    <label className="text-xs font-semibold text-[#6b6257]">
                      Sessions it covers
                      <input aria-label="Sessions" inputMode="numeric" value={edit.sessions} onChange={(e) => setEdit({ ...edit, sessions: e.target.value })} className={`${input} mt-1 block w-28`} />
                    </label>
                    <label className="min-w-40 flex-1 text-xs font-semibold text-[#6b6257]">
                      Short description
                      <input aria-label="Description" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} className={`${input} mt-1 block w-full`} />
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={saveEdit} disabled={!edit.name || !edit.price} className="rounded-md bg-[#16181d] px-3 py-1.5 text-sm font-semibold text-[#f4f1ea] disabled:opacity-50">
                      Save changes
                    </button>
                    <button onClick={() => setEditing(null)} className="text-sm font-semibold text-[#857c70]">
                      Cancel
                    </button>
                    <span className="text-xs text-[#857c70]">A new price applies to future purchases. Payments already made keep what was paid.</span>
                  </div>
                </li>
              ) : (
                <li key={p.id} className={`flex items-center gap-3 py-2 text-sm ${p.active ? "" : "text-[#a79e91]"}`}>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-[#16181d]">{p.name}</span> <span className="tabular-nums">{dollars(p.priceCents)}</span>
                    {p.sessions > 1 && <span> &middot; {p.sessions} sessions</span>}
                    {p.description && <span className="block text-xs text-[#857c70]">{p.description}</span>}
                  </span>
                  <button onClick={() => startEdit(p)} className="text-xs font-semibold text-[#16181d]">
                    Edit
                  </button>
                  <button onClick={() => toggle(p)} className="text-xs font-semibold text-[#c1272d]">
                    {p.active ? "Turn off" : "Turn on"}
                  </button>
                </li>
              )
            )}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input aria-label="New item name" placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${input} w-44`} />
          <input aria-label="New item price" placeholder="Price" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} className={`${input} w-24`} />
          <input aria-label="Sessions it covers" placeholder="Sessions" inputMode="numeric" value={draft.sessions} onChange={(e) => setDraft({ ...draft, sessions: e.target.value })} className={`${input} w-24`} />
          <input aria-label="Short description" placeholder="Short description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={`${input} min-w-40 flex-1`} />
          <button onClick={add} disabled={!draft.name || !draft.price} className="rounded-md bg-[#16181d] px-3 py-1.5 text-sm font-semibold text-[#f4f1ea] disabled:opacity-50">
            Add
          </button>
        </div>
      </div>

      <div className="border-t border-[#f0ece4] pt-4">
        <h3 className="font-display text-lg font-bold text-[#16181d]">How they can pay</h3>
        <p className="mt-1 text-sm text-[#6b6257]">
          Card: {cardReady ? "on" : "not set up yet"}. Venmo and bank show up on the Pay screen only if you fill them in.
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-[#6b6257]">
            Venmo handle
            <input aria-label="Venmo handle" placeholder="@yourname" value={v.venmoHandle} onChange={(e) => setV({ ...v, venmoHandle: e.target.value })} className={`${input} mt-1 block w-full`} />
          </label>
          <label className="text-xs font-semibold text-[#6b6257] sm:row-span-2">
            Bank or Zelle details
            <textarea aria-label="Bank or Zelle details" rows={4} placeholder="Zelle: you@example.com" value={v.payInstructions} onChange={(e) => setV({ ...v, payInstructions: e.target.value })} className={`${input} mt-1 block w-full`} />
          </label>
        </div>
        <button onClick={saveMethods} className="mt-3 rounded-md bg-[#16181d] px-4 py-1.5 text-sm font-semibold text-[#f4f1ea]">
          Save
        </button>
      </div>
    </div>
  )
}
