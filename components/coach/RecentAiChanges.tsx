'use client'

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

export type RecentAiChange = { id: string; when: string; who: string; request: string; count: number; undone: boolean }

/** The last few batches of AI edits on this client, with Undo. Client-applied ones are why the coach looks here. */
export default function RecentAiChanges({ items: initial }: { items: RecentAiChange[] }) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  if (!items.length) return null

  const undo = async (id: string) => {
    const res = await fetch("/api/ai/assist/undo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changeSetId: id }) })
    if (!res.ok) return toast.error("Couldn't undo that")
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, undone: true } : x)))
    router.refresh()
  }

  return (
    <section data-testid="recent-ai-changes" className="rounded-2xl border border-[#e0dad0] bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#857c70]">Recent AI changes</p>
      <ul className="mt-1 divide-y divide-[#f0ece4]">
        {items.map((x) => (
          <li key={x.id} className="flex items-start justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="text-[#16181d]">
                <span className="font-semibold">{x.who}</span> <span className="text-[#6b6257]">{x.when}</span>{" "}
                <span className="text-[#6b6257]">
                  &middot; {x.count} {x.count === 1 ? "edit" : "edits"}
                </span>
              </p>
              <p className="truncate text-xs text-[#6b6257]">{x.request}</p>
            </div>
            {x.undone ? (
              <span className="shrink-0 text-xs text-[#857c70]">Undone</span>
            ) : (
              <button onClick={() => undo(x.id)} className="shrink-0 rounded-lg border border-[#e0dad0] px-3 py-1 text-xs font-semibold text-[#16181d]">
                Undo
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
