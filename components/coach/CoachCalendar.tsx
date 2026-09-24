'use client'

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import AddWorkoutButton from "./AddWorkoutButton"
import { DragGhost, useDragToDay } from "@/components/useDragToDay"

export type CalItem = {
  id: string
  name: string
  status: "draft" | "rest" | "done" | "missed" | "planned"
  note: boolean
  /** Completed sessions stay where they were done. */
  movable: boolean
}
export type CalDay = { key: string; date: number; inMonth: boolean; items: CalItem[] }

const TONE: Record<CalItem["status"], string> = {
  draft: "bg-[#efe6f6] text-[#5b3590]",
  rest: "bg-[#f1ede5] text-[#6b6257]",
  done: "bg-[#e6f2ea] text-[#2f6b45]",
  missed: "bg-[#fbeceb] text-[#b3211f]",
  planned: "bg-[#eef2f7] text-[#38506b]",
}

const label = (key: string) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })

/** Month grid for one client. Drag a session onto another day to move it. */
export default function CoachCalendar({ clientId, todayKey, days: initial }: { clientId: string; todayKey: string; days: CalDay[] }) {
  const router = useRouter()
  const [days, setDays] = useState(initial)
  useEffect(() => setDays(initial), [initial])

  const move = async (id: string, to: string) => {
    const before = days
    const item = days.flatMap((d) => d.items).find((i) => i.id === id)
    if (!item) return
    // Show it on the new day straight away; the server has the final word.
    setDays((ds) => ds.map((d) => ({ ...d, items: d.key === to ? [...d.items.filter((i) => i.id !== id), item] : d.items.filter((i) => i.id !== id) })))
    const res = await fetch(`/api/workouts/${id}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: to }),
    }).catch(() => null)
    if (!res?.ok) {
      setDays(before)
      toast.error((await res?.json().catch(() => ({})))?.error ?? "Couldn't move that session")
      return
    }
    toast.success(`${item.name} moved to ${label(to)}`)
    router.refresh()
  }

  const { drag, draggable } = useDragToDay({ onDrop: move })

  return (
    <>
      <div className="grid grid-cols-7 gap-1.5 p-3">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="text-center text-[11px] font-bold text-[#857c70]">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const target = drag?.over === d.key && drag.ok
          return (
            <div
              key={d.key}
              data-drop-day={d.key}
              className={`group min-h-[86px] rounded-lg border p-1.5 transition-shadow ${
                target
                  ? "border-[#c1272d] bg-[#fdf3f2] shadow-[0_0_0_3px_rgba(193,39,45,0.25)]"
                  : d.key === todayKey
                    ? "border-2 border-[#c1272d] bg-white"
                    : d.inMonth
                      ? "border-[#e4dfd5] bg-white"
                      : "border-[#efeae1] bg-[#faf8f4]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] ${d.key === todayKey ? "font-bold text-[#c1272d]" : "text-[#a79e91]"}`}>{d.date}</span>
                <AddWorkoutButton clientId={clientId} date={d.key} />
              </div>
              <div className="mt-1 space-y-1">
                {d.items.map((w) => (
                  <Link
                    key={w.id}
                    href={`/coach/clients/${clientId}/workouts/${w.id}`}
                    draggable={false}
                    title={w.movable ? "Drag to another day to move it" : undefined}
                    {...(w.movable ? draggable(w.id, d.key, w.name) : {})}
                    className={`block truncate rounded px-1.5 py-1 text-[11px] font-semibold ${TONE[w.status]} ${
                      w.movable ? "cursor-grab active:cursor-grabbing" : ""
                    } ${drag?.id === w.id ? "opacity-40" : ""}`}
                  >
                    {w.name}
                    {w.note && " 💬"}
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <DragGhost drag={drag} className="bg-[#16181d] text-white" />
    </>
  )
}
