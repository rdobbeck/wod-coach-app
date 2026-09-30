'use client'

import Link from "next/link"
import { useEffect, useState } from "react"
import type { CalDay } from "./CoachCalendar"
import { localDayKey } from "@/components/client/MoveWorkoutButton"

/** One tap from the client's page into today's session in train mode. Today is the coach's local day, not the server's. */
export default function TrainTodayButton({ clientId, days }: { clientId: string; days: CalDay[] }) {
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => setToday(localDayKey()), [])
  // Any real session on the coach's local day. The server's "missed" is UTC-based, so late in the evening today's session already carries it.
  const session = days.find((d) => d.key === today)?.items.find((w) => w.status !== "draft" && w.status !== "rest")
  if (!session) return null
  return (
    <Link
      href={`/coach/clients/${clientId}/workouts/${session.id}/train`}
      className="inline-flex items-center gap-2 rounded-lg bg-[#c1272d] px-4 py-2 text-sm font-semibold text-white"
    >
      Train today <span className="font-normal opacity-80">· {session.name}</span>
    </Link>
  )
}
