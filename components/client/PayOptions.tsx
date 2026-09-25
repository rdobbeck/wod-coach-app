'use client'

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { dollars } from "@/lib/pay/money"

export type PayProduct = { id: string; name: string; description: string | null; priceCents: number; sessions: number }
export type PayMethods = { card: boolean; venmo: string | null; instructions: string | null }

const venmoLink = (handle: string, cents: number, note: string) =>
  `https://venmo.com/${encodeURIComponent(handle)}?txn=pay&amount=${(cents / 100).toFixed(2)}&note=${encodeURIComponent(note)}`

/** What a client can buy, and every way they can pay for it. */
export default function PayOptions({ products, methods, coachName }: { products: PayProduct[]; methods: PayMethods; coachName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [sent, setSent] = useState<Record<string, boolean>>({})
  const anyMethod = methods.card || !!methods.venmo || !!methods.instructions

  const card = async (p: PayProduct) => {
    setBusy(`card-${p.id}`)
    const res = await fetch("/api/pay/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: p.id }),
    }).catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok || !d.url) {
      setBusy(null)
      return toast.error(d.error ?? "Couldn't start the payment. Try again in a moment.")
    }
    window.location.href = d.url
  }

  const claim = async (p: PayProduct, method: "VENMO" | "BANK") => {
    setBusy(`${method}-${p.id}`)
    const res = await fetch("/api/pay/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: p.id, method }),
    }).catch(() => null)
    setBusy(null)
    if (!res?.ok) return toast.error("Couldn't send that. Try again.")
    setSent((s) => ({ ...s, [`${method}-${p.id}`]: true }))
    toast.success(`Thanks. ${coachName} will confirm when it arrives.`)
    router.refresh()
  }

  if (!products.length) return <p className="rounded-2xl border border-dashed border-app-border p-5 text-sm text-app-muted">{coachName} has not set up anything to buy yet. Send a message and they will sort it out.</p>
  if (!anyMethod) return <p className="rounded-2xl border border-dashed border-app-border p-5 text-sm text-app-muted">Payment options are not set up yet. Message {coachName} to arrange it.</p>

  return (
    <ul className="space-y-3">
      {products.map((p) => {
        const expanded = open === p.id
        return (
          <li key={p.id} className="overflow-hidden rounded-2xl border border-app-border bg-app-surface">
            <button onClick={() => setOpen(expanded ? null : p.id)} aria-expanded={expanded} className="flex w-full items-center gap-3 p-4 text-left">
              <span className="min-w-0 flex-1">
                <span className="block font-display text-xl font-semibold leading-tight">{p.name}</span>
                {p.description && <span className="block text-sm text-app-muted">{p.description}</span>}
              </span>
              <span className="font-display text-2xl font-bold">{dollars(p.priceCents)}</span>
            </button>

            {expanded && (
              <div className="space-y-3 border-t border-app-border p-4">
                {methods.card && (
                  <button
                    onClick={() => card(p)}
                    disabled={busy !== null}
                    className="pulse-cta w-full rounded-xl bg-app-accent px-4 py-3 font-display text-lg font-bold uppercase tracking-[0.06em] text-app-accent-text disabled:opacity-60"
                  >
                    {busy === `card-${p.id}` ? "One moment…" : `Pay ${dollars(p.priceCents)} by card`}
                  </button>
                )}

                {methods.venmo && (
                  <div className="rounded-xl bg-app-bg p-3 text-sm">
                    <p className="font-semibold">Venmo</p>
                    <p className="mt-0.5 text-app-muted">
                      Send {dollars(p.priceCents)} to <span className="font-semibold text-app-text">@{methods.venmo}</span>. Put your name and &ldquo;{p.name}&rdquo; in the note.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a href={venmoLink(methods.venmo, p.priceCents, `${p.name}`)} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-app-border px-3 py-2 font-semibold">
                        Open Venmo
                      </a>
                      <button onClick={() => claim(p, "VENMO")} disabled={busy !== null || sent[`VENMO-${p.id}`]} className="rounded-lg bg-app-surface2 px-3 py-2 font-semibold disabled:opacity-60">
                        {sent[`VENMO-${p.id}`] ? "Sent, thanks" : "I sent it"}
                      </button>
                    </div>
                  </div>
                )}

                {methods.instructions && (
                  <div className="rounded-xl bg-app-bg p-3 text-sm">
                    <p className="font-semibold">Bank or Zelle</p>
                    <p className="mt-0.5 whitespace-pre-line text-app-muted">{methods.instructions}</p>
                    <button onClick={() => claim(p, "BANK")} disabled={busy !== null || sent[`BANK-${p.id}`]} className="mt-2 rounded-lg bg-app-surface2 px-3 py-2 font-semibold disabled:opacity-60">
                      {sent[`BANK-${p.id}`] ? "Sent, thanks" : "I sent it"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
