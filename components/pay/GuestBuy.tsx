'use client'

import { useState } from "react"
import { toast } from "sonner"
import { dollars } from "@/lib/pay/money"

type Item = { id: string; name: string; description: string | null; priceCents: number }

/** The public buy screen: pick something, give an email, go to the card page. */
export default function GuestBuy({ slug, items, cardReady, coachFirst }: { slug: string; items: Item[]; cardReady: boolean; coachFirst: string }) {
  const [picked, setPicked] = useState<string | null>(items[0]?.id ?? null)
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const item = items.find((i) => i.id === picked)

  const pay = async () => {
    if (!item) return
    setBusy(true)
    const res = await fetch("/api/pay/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, productId: item.id, email }),
    }).catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok || !d.url) {
      setBusy(false)
      return toast.error(d.error ?? "Couldn't start the payment. Try again in a moment.")
    }
    window.location.href = d.url
  }

  if (!items.length) return <p className="mt-6 text-[#8c8478]">Nothing is available to buy online right now. Message {coachFirst} to arrange a session.</p>
  if (!cardReady) return <p className="mt-6 text-[#8c8478]">Online payment is not set up yet. Message {coachFirst} to arrange a session.</p>

  return (
    <div className="mt-6 space-y-3">
      <ul className="space-y-2" role="radiogroup" aria-label="What to buy">
        {items.map((i) => (
          <li key={i.id}>
            <button
              role="radio"
              aria-checked={picked === i.id}
              onClick={() => setPicked(i.id)}
              className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left ${picked === i.id ? "border-[#c1272d] bg-[#16181d]" : "border-[#2e3138]"}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-display text-xl font-semibold leading-tight">{i.name}</span>
                {i.description && <span className="block text-sm text-[#8c8478]">{i.description}</span>}
              </span>
              <span className="font-display text-2xl font-bold">{dollars(i.priceCents)}</span>
            </button>
          </li>
        ))}
      </ul>

      <label className="block text-sm text-[#8c8478]">
        Your email, for the receipt
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-1 block w-full rounded-xl border border-[#2e3138] bg-[#0e0f12] px-3 py-3 text-base text-[#f4f1ea] placeholder:text-[#5f584d]"
        />
      </label>
      <button
        onClick={pay}
        disabled={busy || !item || !email.includes("@")}
        className="pulse-cta h-14 w-full rounded-xl bg-[#c1272d] font-display text-xl font-semibold uppercase tracking-[0.06em] text-white disabled:opacity-50"
      >
        {busy ? "One moment…" : item ? `Pay ${dollars(item.priceCents)} by card` : "Pay"}
      </button>
    </div>
  )
}
