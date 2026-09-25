'use client'

import { useState } from "react"
import { toast } from "sonner"

type PlanCard = { id: string; name: string; clients: number; aiPrograms: number; assistant: boolean; monthlyCents: number; yearlyCents: number }

const dollars = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`

async function go(body: Record<string, unknown>, url = "/api/billing/checkout") {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.url) {
    toast.error(data.error ?? "Couldn't open checkout")
    return false
  }
  window.location.href = data.url
  return true
}

/** Plan picker with a monthly/yearly switch. Checkout happens on Stripe. */
export function PlanPicker({ plans, currentId, setupPaid }: { plans: PlanCard[]; currentId: string; setupPaid: boolean }) {
  const [yearly, setYearly] = useState(false)
  const [setup, setSetup] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-[#ddd7cc] bg-white p-1 text-sm font-semibold">
          {[false, true].map((y) => (
            <button
              key={String(y)}
              onClick={() => setYearly(y)}
              aria-pressed={yearly === y}
              className={`rounded-lg px-3 py-1.5 ${yearly === y ? "bg-[#16181d] text-[#f4f1ea]" : "text-[#6b6257]"}`}
            >
              {y ? "Yearly · 2 months free" : "Monthly"}
            </button>
          ))}
        </div>
        {!setupPaid && !yearly && (
          <label className="flex items-center gap-2 text-sm text-[#4a443c]">
            <input type="checkbox" checked={setup} onChange={(e) => setSetup(e.target.checked)} className="h-4 w-4" />
            Add done-for-you setup ($199)
          </label>
        )}
        {!setupPaid && yearly && <p className="text-sm font-semibold text-[#2f7d4f]">Done-for-you setup included free</p>}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {plans.map((p) => {
          const current = p.id === currentId
          return (
            <div key={p.id} className={`rounded-2xl border bg-white p-5 ${p.id === "PRO" ? "border-[#c1272d]" : "border-[#e4dfd5]"}`}>
              <div className="flex items-baseline justify-between">
                <p className="font-display text-2xl font-bold text-[#16181d]">{p.name}</p>
                {p.id === "PRO" && <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#c1272d]">Most coaches</span>}
              </div>
              <p className="mt-2">
                <span className="font-display text-4xl font-bold text-[#16181d]">{dollars(yearly ? p.yearlyCents / 12 : p.monthlyCents)}</span>
                <span className="text-sm text-[#6b6257]">/mo{yearly ? `, ${dollars(p.yearlyCents)} a year` : ""}</span>
              </p>
              <ul className="mt-3 space-y-1 text-sm text-[#4a443c]">
                <li>Up to {p.clients} clients</li>
                <li>{p.aiPrograms} AI-built programs a month</li>
                {p.assistant && <li>AI coaching assistant</li>}
                <li>Every feature, no add-ons</li>
              </ul>
              <button
                disabled={!!busy || current}
                onClick={async () => {
                  setBusy(p.id)
                  if (!(await go({ kind: "plan", plan: p.id, interval: yearly ? "year" : "month", setup }))) setBusy(null)
                }}
                className={`mt-4 h-11 w-full rounded-xl text-sm font-semibold disabled:opacity-60 ${
                  p.id === "PRO" ? "bg-[#c1272d] text-white" : "bg-[#16181d] text-[#f4f1ea]"
                }`}
              >
                {current ? "Your trial plan" : busy === p.id ? "Opening checkout..." : `Choose ${p.name}`}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ManageBillingButton() {
  const [busy, setBusy] = useState(false)
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        if (!(await go({}, "/api/billing/portal"))) setBusy(false)
      }}
      className="rounded-xl bg-[#16181d] px-4 py-2 text-sm font-semibold text-[#f4f1ea] disabled:opacity-60"
    >
      {busy ? "Opening..." : "Manage billing"}
    </button>
  )
}

export function BuyButton({ body, label, className }: { body: Record<string, unknown>; label: string; className?: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        if (!(await go(body))) setBusy(false)
      }}
      className={className ?? "rounded-xl border border-[#ddd7cc] bg-white px-4 py-2 text-sm font-semibold text-[#16181d] disabled:opacity-60"}
    >
      {busy ? "Opening..." : label}
    </button>
  )
}
