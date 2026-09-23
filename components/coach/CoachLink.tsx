'use client'

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { BRAND_DOMAIN, normalizeSlug } from "@/lib/coach-link"

/** The coach's own page, <slug>.wod.coach, and the name shown on it. */
export default function CoachLink({ slug, brandName, live }: { slug: string | null; brandName: string | null; live: boolean }) {
  const router = useRouter()
  const [value, setValue] = useState(slug ?? "")
  const [brand, setBrand] = useState(brandName ?? "")
  const [status, setStatus] = useState<{ ok: boolean; error?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const url = `https://${slug}.${BRAND_DOMAIN}`

  useEffect(() => {
    if (!value || value === slug) return setStatus(null)
    const t = setTimeout(async () => {
      const res = await fetch(`/api/coach/slug?slug=${encodeURIComponent(value)}`).catch(() => null)
      if (res?.ok) setStatus(await res.json())
    }, 350)
    return () => clearTimeout(t)
  }, [value, slug])

  const save = async (body: Record<string, unknown>, done: string) => {
    setBusy(true)
    const res = await fetch("/api/coach/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    setBusy(false)
    if (!res.ok) return toast.error((await res.json().catch(() => null))?.error ?? "Couldn't save")
    toast.success(done)
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-[#e4dfd5] bg-white p-4">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-[#857c70]">Your link</p>
      {slug && live && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-[#c1272d]">
            {slug}.{BRAND_DOMAIN}
          </a>
          <button
            onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Link copied"))}
            className="rounded-lg border border-[#ddd7cc] px-2 py-1 text-xs font-semibold text-[#16181d]"
          >
            Copy
          </button>
        </div>
      )}
      <p className="mt-2 text-sm text-[#4a443c]">
        Your own page. Clients sign in from it, and their invite links use it.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-xl border border-[#ddd7cc]">
          <input
            value={value}
            onChange={(e) => setValue(normalizeSlug(e.target.value.replace(/\s/g, "-")).slice(0, 30))}
            autoCapitalize="none"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-l-xl px-3 py-2 text-right text-base text-[#16181d] focus:outline-none"
            placeholder="yourname"
          />
          <span className="pr-3 text-sm text-[#6b6257]">.{BRAND_DOMAIN}</span>
        </div>
        <button
          onClick={() => save({ slug: value }, `Your link is now ${value}.${BRAND_DOMAIN}`)}
          disabled={busy || !value || value === slug || (status !== null && !status.ok)}
          className="rounded-xl bg-[#16181d] px-4 py-2 text-sm font-semibold text-[#f4f1ea] disabled:opacity-40"
        >
          Save
        </button>
      </div>
      {status && !status.ok && <p className="mt-1 text-xs text-[#c1272d]">{status.error}</p>}
      {slug && value !== slug && (!status || status.ok) && (
        <p className="mt-1 text-xs text-[#6b6257]">Links you already sent with the old name will stop working.</p>
      )}

      <div className="mt-4">
        <p className="text-sm text-[#6b6257]">Business name on your page (optional)</p>
        <div className="mt-1 flex items-center gap-2">
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value.slice(0, 60))}
            className="min-w-0 flex-1 rounded-xl border border-[#ddd7cc] px-3 py-2 text-base text-[#16181d]"
            placeholder="e.g. Dobbeck Training"
          />
          <button
            onClick={() => save({ brandName: brand }, brand.trim() ? "Business name saved" : "Business name removed")}
            disabled={busy || brand.trim() === (brandName ?? "")}
            className="rounded-xl bg-[#16181d] px-4 py-2 text-sm font-semibold text-[#f4f1ea] disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
