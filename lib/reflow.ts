import { dayKey } from "./training"

/**
 * Spreading a week's sessions across the days a client can actually train.
 *
 * The rule is: keep the order the coach wrote, and use the chosen days evenly.
 * Three sessions across three days is one each. Three across two puts two on
 * the first day and one on the second, rather than dropping anything, because
 * a session the client never sees is worse than a heavy day they can move.
 */
export type Movable = { id: string; day: string; name: string }
export type Reflow = { id: string; from: string; to: string; name: string }

/**
 * Which session lands on which day. `days` is the set the client picked, in
 * calendar order; `sessions` are theirs for that week, in the order they sit on
 * the calendar now.
 */
export function planReflow(sessions: Movable[], days: string[]): Reflow[] {
  if (!sessions.length || !days.length) return []

  const slots: string[] = []
  const per = Math.floor(sessions.length / days.length)
  let extra = sessions.length % days.length

  for (const day of days) {
    // The earlier days take the remainder, so a light day lands at the end of
    // the week rather than the start of it.
    const count = per + (extra > 0 ? 1 : 0)
    if (extra > 0) extra--
    for (let i = 0; i < count; i++) slots.push(day)
  }

  return sessions
    .map((s, i) => ({ id: s.id, from: s.day, to: slots[i], name: s.name }))
    .filter((m) => m.to && m.to !== m.from)
}

/** The seven day keys of the week containing `from`, Monday first. */
export function weekDays(from: Date): string[] {
  const monday = new Date(from)
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + i)
    return dayKey(d)
  })
}
