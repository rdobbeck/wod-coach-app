"use client"

import { useState } from "react"
import { toast } from "sonner"
import VideoPlayer from "@/components/VideoPlayer"
import VideoThumb from "@/components/VideoThumb"
import { MUSCLE_GROUPS, type GroupId } from "@/lib/muscles/groups"
import type { ReviewRow } from "@/lib/muscles/review"

type Role = "primary" | "secondary"
type Roles = Partial<Record<GroupId, Role>>

const cycle = (r: Role | undefined): Role | undefined => (r === undefined ? "primary" : r === "primary" ? "secondary" : undefined)
const rolesOf = (row: ReviewRow): Roles => {
  const out: Roles = {}
  row.primary.forEach((g) => {
    out[g] = "primary"
  })
  row.secondary.forEach((g) => {
    out[g] = "secondary"
  })
  return out
}
const listOf = (roles: Roles, role: Role) => MUSCLE_GROUPS.map((g) => g.id).filter((id) => roles[id] === role)
const sameRoles = (a: Roles, b: Roles) => MUSCLE_GROUPS.every((g) => a[g.id] === b[g.id])

const CHIP: Record<Role | "off", string> = {
  primary: "border-primary-600 bg-primary-600 text-white",
  secondary: "border-primary-600 bg-white text-primary-700",
  off: "border-gray-300 bg-white text-gray-500",
}

/**
 * One exercise name on the review screen: its uses, demo, and current muscles. In the editor each
 * group chip cycles off, primary, secondary. One button marks it reviewed: "Looks right" confirms
 * the chips as they are, "Save" sends an edit. A saved row stays where it is, marked Reviewed.
 */
export default function MuscleReviewRow({ row }: { row: ReviewRow }) {
  const [saved, setSaved] = useState<Roles>(() => rolesOf(row))
  const [roles, setRoles] = useState<Roles>(saved)
  const [reviewed, setReviewed] = useState(row.reviewed)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [playing, setPlaying] = useState(false)
  const changed = !sameRoles(roles, saved)

  const save = async () => {
    setBusy(true)
    const res = await fetch(`/api/exercises/${row.id}/muscles`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primary: listOf(roles, "primary"), secondary: listOf(roles, "secondary") }),
    }).catch(() => null)
    setBusy(false)
    const d = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) return toast.error(d.error ?? "Couldn't save. Try again.")
    setSaved(roles)
    setReviewed(true)
    setEditing(false)
  }

  const shown = MUSCLE_GROUPS.filter((g) => saved[g.id])
  return (
    <li data-testid="review-row" className="rounded-lg bg-white p-4 shadow">
      <div className="flex items-start gap-3">
        {row.videoUrl && <VideoThumb compact url={row.videoUrl} title={row.name} onPlay={() => setPlaying(true)} className="w-24 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500">
            {row.uses.toLocaleString()} {row.uses === 1 ? "use" : "uses"}
            {reviewed && <span className="ml-2 font-semibold text-green-700">Reviewed</span>}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {shown.length ? (
              shown.map((g) => (
                <span key={g.id} className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${CHIP[saved[g.id] ?? "off"]}`}>
                  {g.label}
                </span>
              ))
            ) : (
              <span className="text-xs text-gray-500">No muscles</span>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={`Muscles for ${row.name}`}>
          {MUSCLE_GROUPS.map((g) => {
            const r = roles[g.id]
            return (
              <button
                key={g.id}
                type="button"
                aria-label={`${g.label}: ${r ?? "off"}`}
                onClick={() => setRoles((prev) => ({ ...prev, [g.id]: cycle(prev[g.id]) }))}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${CHIP[r ?? "off"]}`}
              >
                {g.label}
              </button>
            )
          })}
          <p className="w-full text-xs text-gray-500">Tap to cycle: off, primary (filled), secondary (outline).</p>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setEditing((e) => !e)} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
          {editing ? "Close" : "Edit"}
        </button>
        <button type="button" onClick={() => void save()} disabled={busy} className="rounded bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
          {changed ? "Save" : "Looks right"}
        </button>
      </div>
      {playing && row.videoUrl && <VideoPlayer items={[{ key: row.id, title: row.name, url: row.videoUrl }]} startIndex={0} onClose={() => setPlaying(false)} />}
    </li>
  )
}
