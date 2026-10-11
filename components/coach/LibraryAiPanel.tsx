"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { PATTERNS, type ProposedEntry } from "@/lib/library/propose"

type Meter = { spent: number; cap: number; level: "ok" | "warn" | "capped" }
type Row = ProposedEntry & { key: string; picked: boolean; replace: boolean; error?: string }

const money = (n: number) => `$${n.toFixed(2)}`
const length = (s: number | null) => (s == null ? "" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`)
const INPUT = "w-full rounded border border-[#ddd7cc] bg-[#faf8f4] px-2 py-1.5 text-sm text-[#16181d]"

/**
 * "Add with AI" on the library page: paste YouTube links or exercise names,
 * review the proposed entries, edit anything inline, save the ticked ones.
 * The proposal lives only in this component's state.
 */
export default function LibraryAiPanel({ meter: initial }: { meter: Meter }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState<"" | "reading" | "saving">("")
  const [rows, setRows] = useState<Row[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [dropped, setDropped] = useState<string[]>([])
  const [meter, setMeter] = useState(initial)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const patch = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)))

  const propose = async () => {
    if (!text.trim() || busy) return
    setBusy("reading")
    setRows([])
    const res = await fetch("/api/library/ai/propose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => null)
    setBusy("")
    const d = res ? await res.json().catch(() => ({})) : {}
    if (d.meter) setMeter(d.meter)
    if (!res?.ok) return toast.error(d.error ?? "Could not reach the AI. Try again.")
    // Replacing an existing entry's video is opt-in: a wrong fuzzy match must never overwrite a curated video by default.
    setRows((d.entries as ProposedEntry[]).map((e) => ({ ...e, key: `${e.line}-${e.videoUrl}`, picked: e.confidence !== "low", replace: false })))
    setWarnings(d.warnings ?? [])
    setDropped(d.dropped ?? [])
    if (!d.entries?.length) toast.message("Nothing to propose from those lines.")
  }

  const save = async () => {
    const chosen = rows.filter((r) => r.picked)
    if (!chosen.length || busy) return
    setBusy("saving")
    const res = await fetch("/api/library/ai/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: chosen.map((r) => ({
          key: r.key,
          name: r.name, videoUrl: r.videoUrl, thumbnailUrl: r.thumbnailUrl, patterns: r.patterns, equipment: r.equipment, cues: r.cues, summary: r.summary,
          ...(r.replace && r.duplicate ? { replaceId: r.duplicate.id } : {}),
        })),
      }),
    }).catch(() => null)
    setBusy("")
    const d = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) return toast.error(d.error ?? "Could not save. Try again.")
    const failed = new Map<string, string>((d.failed ?? []).map((f: { key?: string; error: string }) => [f.key ?? "", f.error]))
    const n = (d.saved ?? []).length
    if (n) toast.success(`Saved ${n} ${n === 1 ? "exercise" : "exercises"} to your library`)
    if (failed.size) {
      // Failed rows stay with their reason; saved rows leave the list.
      setRows((cur) => cur.filter((r) => !r.picked || failed.has(r.key)).map((r) => (failed.has(r.key) ? { ...r, error: failed.get(r.key) } : r)))
      router.refresh()
      return
    }
    setRows([])
    setText("")
    setOpen(false)
    const first = d.saved?.[0]?.name
    if (first) router.push(`/coach/library?q=${encodeURIComponent(first)}`)
    router.refresh()
  }

  const picked = rows.filter((r) => r.picked).length
  const pct = Math.min(100, (meter.spent / meter.cap) * 100)
  const bar = meter.level === "capped" ? "bg-[#c1272d]" : meter.level === "warn" ? "bg-[#c88c3c]" : "bg-[#3e8e5a]"

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded border border-[#16181d] px-4 py-2 text-sm font-medium text-[#16181d] hover:bg-[#f4f2ed]">
        <span aria-hidden>&#10022;</span> Add with AI
      </button>

      {open && (
        <div className="fixed inset-0 z-40 sm:inset-auto sm:bottom-5 sm:right-5 sm:top-5" role="dialog" aria-label="Add exercises with AI">
          <div className="flex h-full w-full flex-col overflow-hidden bg-[#f4f2ed] shadow-2xl sm:w-[32rem] sm:rounded-2xl sm:border sm:border-[#e0dad0]">
            <div className="border-b border-[#e0dad0] bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-display text-xl font-bold leading-none text-[#16181d]">Add with AI</p>
                  <p className="text-xs text-[#6b6257]">One YouTube link or exercise name per line. You review every entry before it is saved.</p>
                </div>
                <button onClick={() => setOpen(false)} className="rounded-full px-3 py-1 text-sm font-semibold text-[#6b6257]" aria-label="Close">
                  Close
                </button>
              </div>
              <div className="mt-2" title="Resets on the 1st">
                <div className="flex justify-between text-[11px] text-[#6b6257]">
                  <span>AI spend this month</span>
                  <span className="font-semibold tabular-nums">
                    {money(meter.spent)} of ${meter.cap.toFixed(0)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#e7e2d9]">
                  <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                aria-label="Links or names"
                placeholder={"https://youtu.be/...\n90/90 Hip Lift https://youtu.be/...\nGoblet Squat"}
                disabled={!!busy || meter.level === "capped"}
                className={`${INPUT} min-h-[6rem]`}
              />
              <button
                type="button"
                onClick={() => void propose()}
                disabled={!!busy || !text.trim() || meter.level === "capped"}
                className="rounded-xl bg-[#16181d] px-4 py-2 font-display text-base font-bold uppercase tracking-[0.06em] text-[#f4f1ea] disabled:opacity-40"
              >
                Propose
              </button>
              {busy === "reading" && <p className="animate-pulse text-sm text-[#6b6257]">Reading the videos, then thinking&hellip;</p>}

              {rows.map((r, i) => (
                <div key={r.key} data-entry className={`rounded-2xl border bg-white p-3 ${r.picked ? "border-[#e0dad0]" : "border-[#eee9e0] opacity-80"}`}>
                  <div className="flex gap-3">
                    <input type="checkbox" checked={r.picked} onChange={(e) => patch(i, { picked: e.target.checked })} disabled={!!busy} className="mt-1 h-4 w-4 shrink-0 accent-[#c1272d]" aria-label={`Save ${r.name}`} />
                    <a href={r.videoUrl} target="_blank" rel="noopener noreferrer" className="block w-24 shrink-0 overflow-hidden rounded bg-[#e7e2d9]" aria-label="Open the video">
                      {r.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.thumbnailUrl} alt="" className="aspect-video w-full object-cover" />
                      ) : (
                        <div className="aspect-video w-full" />
                      )}
                    </a>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <input value={r.name} onChange={(e) => patch(i, { name: e.target.value })} aria-label="Name" className={`${INPUT} font-semibold`} />
                      <p className="text-[11px] text-[#857c70]">
                        Line {r.line}
                        {r.confidence === "low" && <span className="ml-1.5 rounded bg-[#fbf0dc] px-1.5 py-0.5 font-semibold text-[#7a4f08]">Low confidence</span>}
                        {r.unknownEquipment && <span className="ml-1.5 rounded bg-[#f1ede5] px-1.5 py-0.5 font-semibold text-[#6b6257]">New equipment word</span>}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {PATTERNS.map((p) => {
                      const on = r.patterns.includes(p)
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => patch(i, { patterns: on ? r.patterns.filter((x) => x !== p) : [...r.patterns, p].slice(-2) })}
                          aria-pressed={on}
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${on ? "bg-[#16181d] text-[#f4f1ea]" : "bg-[#f1ede5] text-[#6b6257]"}`}
                        >
                          {p}
                        </button>
                      )
                    })}
                  </div>
                  <input
                    value={r.equipment.join(", ")}
                    onChange={(e) => patch(i, { equipment: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4) })}
                    aria-label="Equipment"
                    placeholder="Equipment, comma separated"
                    className={`${INPUT} mt-2`}
                  />
                  <textarea value={r.cues} onChange={(e) => patch(i, { cues: e.target.value })} aria-label="Cues" rows={2} placeholder="Cues" className={`${INPUT} mt-2`} />

                  {r.duplicate && (
                    <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-[#4a443c]">
                      <input type="checkbox" checked={r.replace} onChange={(e) => patch(i, { replace: e.target.checked })} aria-label="Replace the existing video" className="h-3.5 w-3.5 accent-[#c1272d]" />
                      <span>
                        Looks like <span className="font-semibold">{r.duplicate.name}</span> (has a video). Replace that entry&apos;s video instead of adding a new one.
                      </span>
                    </label>
                  )}
                  {r.alternatives.length > 0 && (
                    <div className="mt-2 text-xs text-[#4a443c]">
                      Other videos found:{" "}
                      {r.alternatives.map((a) => (
                        <button
                          key={a.url}
                          type="button"
                          onClick={() =>
                            patch(i, {
                              videoUrl: a.url,
                              thumbnailUrl: a.thumbnailUrl,
                              alternatives: [{ url: r.videoUrl, title: r.name, seconds: null, thumbnailUrl: r.thumbnailUrl }, ...r.alternatives.filter((x) => x.url !== a.url)],
                            })
                          }
                          className="mr-2 underline"
                        >
                          {a.title} {length(a.seconds)}
                        </button>
                      ))}
                    </div>
                  )}
                  {r.error && <p className="mt-2 text-xs text-[#a3262b]">{r.error}</p>}
                </div>
              ))}

              {warnings.length > 0 && (
                <div className="rounded-xl bg-[#fbf0dc] px-3 py-2 text-xs text-[#7a4f08]">
                  <p className="font-semibold">Worth a look</p>
                  <ul className="mt-0.5 list-disc pl-4">
                    {warnings.map((w, k) => (
                      <li key={k}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {dropped.length > 0 && <p className="px-1 text-xs text-[#857c70]">Left out: {dropped.join(" ")}</p>}
            </div>

            {rows.length > 0 && (
              <div className="border-t border-[#e0dad0] bg-white p-3">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!picked || !!busy}
                  className="pulse-cta w-full rounded-xl bg-[#c1272d] px-3 py-2.5 font-display text-base font-bold uppercase tracking-[0.06em] text-white disabled:opacity-50"
                >
                  {busy === "saving" ? "Saving…" : `Save ${picked} ${picked === 1 ? "exercise" : "exercises"}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
