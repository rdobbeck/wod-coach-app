'use client'

import { useEffect, useState } from "react"
import VideoPlayer from "@/components/VideoPlayer"
import VideoThumb from "@/components/VideoThumb"
import type { GroupId } from "@/lib/muscles/groups"
import type { TrainRow } from "@/lib/muscles/rank"

type Answer = { group: GroupId; label: string; exercises: TrainRow[] }

// One answer per group per page load. A failed request is not kept, so the next tap tries again.
const answers = new Map<GroupId, Answer>()

/** "Train it": up to six of Ryan's exercises for a muscle's training group, each with its demo video. */
export default function TrainIt({ group }: { group: GroupId }) {
  const [answer, setAnswer] = useState<Answer | null>(() => answers.get(group) ?? null)
  const [failed, setFailed] = useState(false)
  const [playing, setPlaying] = useState<number | null>(null)

  useEffect(() => {
    if (answers.has(group)) return
    let live = true
    fetch(`/api/learn/train?group=${encodeURIComponent(group)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Answer>) : Promise.reject(new Error(`status ${r.status}`))))
      .then((a) => {
        answers.set(group, a)
        if (live) setAnswer(a)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [group])

  if (failed) {
    return (
      <p data-testid="train-it-error" className="rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-muted">
        Couldn&apos;t load exercises right now.
      </p>
    )
  }
  if (!answer) return <div data-testid="train-it-loading" className="h-40 animate-pulse rounded-2xl bg-app-surface2" aria-hidden="true" />
  if (!answer.exercises.length) return null
  return (
    <section data-testid="train-it" aria-label={`Train it: ${answer.label}`} className="space-y-3 rounded-2xl border border-app-border bg-app-surface p-4">
      <h3 className="font-display text-xl font-bold">Train it: {answer.label}</h3>
      <ul className="grid grid-cols-2 gap-3">
        {answer.exercises.map((e, i) => (
          <li key={e.id} className="min-w-0 space-y-1">
            <VideoThumb compact url={e.videoUrl} title={e.name} onPlay={() => setPlaying(i)} />
            <p className="text-sm font-semibold leading-tight">{e.name}</p>
          </li>
        ))}
      </ul>
      {playing !== null && (
        <VideoPlayer items={answer.exercises.map((e) => ({ key: e.id, title: e.name, url: e.videoUrl }))} startIndex={playing} onClose={() => setPlaying(null)} />
      )}
    </section>
  )
}
