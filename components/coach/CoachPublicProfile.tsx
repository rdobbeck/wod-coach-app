'use client'

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { toast } from "sonner"

/**
 * What prospective clients see on the coach's own page: photo, bio, what they
 * coach, and credentials. The photo is cropped square and shrunk to 320px in
 * the browser, so it is small enough to store on the profile and show on a
 * public page without any file storage.
 */
async function toSquareJpeg(file: File, size = 320): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = size
    canvas.getContext("2d")!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size)
    return canvas.toDataURL("image/jpeg", 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}

const field = "w-full rounded-xl border border-[#ddd7cc] px-3 py-2 text-base text-[#16181d]"
const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean)

export default function CoachPublicProfile({
  name,
  photo,
  bio,
  specialties,
  certifications,
  yearsExp,
  pageUrl,
}: {
  name: string
  photo: string | null
  bio: string | null
  specialties: string[]
  certifications: string[]
  yearsExp: number | null
  pageUrl: string | null
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [img, setImg] = useState(photo)
  const [text, setText] = useState(bio ?? "")
  const [spec, setSpec] = useState(specialties.join(", "))
  const [certs, setCerts] = useState(certifications.join(", "))
  const [years, setYears] = useState(yearsExp === null ? "" : String(yearsExp))
  const [busy, setBusy] = useState(false)

  const save = async (body: Record<string, unknown>, done: string) => {
    setBusy(true)
    const res = await fetch("/api/coach/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    setBusy(false)
    if (!res.ok) return toast.error((await res.json().catch(() => null))?.error ?? "Couldn't save")
    toast.success(done)
    router.refresh()
  }

  const pick = async (file: File | undefined) => {
    if (!file) return
    try {
      const data = await toSquareJpeg(file)
      setImg(data)
      await save({ photo: data }, "Photo updated")
    } catch {
      toast.error("Couldn't read that image. Try a JPEG or PNG.")
    }
  }

  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("")

  return (
    <div className="rounded-2xl border border-[#e4dfd5] bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-[#857c70]">Your public page</p>
        {pageUrl && (
          <a href={pageUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-[#c1272d]">
            View it
          </a>
        )}
      </div>
      <p className="mt-2 text-sm text-[#4a443c]">What new clients see before they sign in.</p>

      <div className="mt-4 flex items-center gap-4">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#16181d] font-display text-xl font-bold text-[#f4f1ea]">{initials}</span>
        )}
        <div className="flex gap-2">
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="rounded-xl border border-[#ddd7cc] px-3 py-2 text-sm font-semibold text-[#16181d]">
            {img ? "Change photo" : "Add photo"}
          </button>
          {img && (
            <button
              onClick={() => {
                setImg(null)
                void save({ photo: "" }, "Photo removed")
              }}
              disabled={busy}
              className="px-2 text-sm font-semibold text-[#6b6257]"
            >
              Remove
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      </div>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-sm text-[#6b6257]">Bio</span>
          <textarea
            rows={4}
            maxLength={600}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Who you coach and how. A few sentences in your own voice."
            className={`mt-1 ${field}`}
          />
        </label>
        <label className="block">
          <span className="text-sm text-[#6b6257]">What you coach (comma separated, up to 6)</span>
          <input value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="Strength, Hyrox, Olympic lifting" className={`mt-1 ${field}`} />
        </label>
        <label className="block">
          <span className="text-sm text-[#6b6257]">Certifications (comma separated)</span>
          <input value={certs} onChange={(e) => setCerts(e.target.value)} placeholder="CSCS, CF-L2" className={`mt-1 ${field}`} />
        </label>
        <label className="block">
          <span className="text-sm text-[#6b6257]">Years coaching</span>
          <input inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))} className={`mt-1 w-24 ${field}`} />
        </label>
        <button
          onClick={() =>
            save(
              { bio: text, specialties: splitList(spec), certifications: splitList(certs), yearsExp: years === "" ? null : Number(years) },
              "Public page saved"
            )
          }
          disabled={busy}
          className="rounded-xl bg-[#16181d] px-4 py-2 text-sm font-semibold text-[#f4f1ea] disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  )
}
