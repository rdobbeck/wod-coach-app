/**
 * Sessions used and left, worked out from the calendar.
 *
 * The coach numbers sessions in the title ("5/10"). Where a title has no count,
 * the session is counted on from the one before it, and a finished package
 * (10/10) followed by an unnumbered session starts a new one at 1. Nothing is
 * stored: this is recomputed from the events each time.
 */
export type CounterEvent = {
  startsAt: Date
  endsAt?: Date | null
  packageIndex: number | null
  packageSize: number | null
  needsPayment: boolean
  paidOverride?: boolean
}

export type Counter = {
  used: number | null
  size: number | null
  left: number | null
  packageDone: boolean // the last package is used up and nothing new is booked
  next: { startsAt: Date; endsAt: Date | null } | null
  paymentDue: boolean
  estimated: boolean // the numbers were counted on, not read from a title
}

type Numbered = CounterEvent & { n: number | null; size: number | null; inferred: boolean }

/** Give every event a session number: the title's, or counted on from the one before. */
export function numberEvents(events: CounterEvent[]): Numbered[] {
  const sorted = [...events].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  let lastN: number | null = null
  let lastSize: number | null = null
  return sorted.map((e) => {
    let n: number | null = null
    let size: number | null = e.packageSize ?? null
    let inferred = false
    if (e.packageIndex != null && e.packageSize != null) {
      n = e.packageIndex
    } else if (lastN != null && lastSize != null) {
      // No usable count: the next one along, or the start of a new package once the last is full.
      size = size ?? lastSize
      n = lastN >= lastSize ? 1 : lastN + 1
      inferred = true
    }
    if (n != null && size != null && n > size) n = null
    if (n != null && size != null) {
      lastN = n
      lastSize = size
    }
    return { ...e, n, size, inferred }
  })
}

const DAY = 86_400_000

export function computeCounter(events: CounterEvent[], now = new Date()): Counter {
  const all = numberEvents(events)
  const held = all.filter((e) => e.startsAt.getTime() <= now.getTime())
  const upcoming = all.filter((e) => e.startsAt.getTime() > now.getTime())
  const lastHeld = [...held].reverse().find((e) => e.n != null && e.size != null) ?? null
  const next = upcoming[0] ?? null

  let used: number | null = null
  let size: number | null = null
  let estimated = false
  const nextNumbered = upcoming.find((e) => e.n != null && e.size != null) ?? null

  if (lastHeld && (!nextNumbered || nextNumbered.size === lastHeld.size) && lastHeld.n! < (nextNumbered?.n ?? Infinity) && !(nextNumbered?.n === 1 && lastHeld.n === lastHeld.size)) {
    used = lastHeld.n
    size = lastHeld.size
    estimated = lastHeld.inferred
  } else if (nextNumbered) {
    // A new package has started, or nothing has been held in this one yet.
    used = nextNumbered.n! - 1
    size = nextNumbered.size
    estimated = nextNumbered.inferred
  } else if (lastHeld) {
    used = lastHeld.n
    size = lastHeld.size
    estimated = lastHeld.inferred
  }

  const left = used != null && size != null ? Math.max(0, size - used) : null
  // A flag on a recent or upcoming session counts as due, unless it was marked paid here.
  const paymentDue = all.some((e) => e.needsPayment && !e.paidOverride && e.startsAt.getTime() >= now.getTime() - 14 * DAY)

  return {
    used,
    size,
    left,
    packageDone: left === 0 && !next,
    next: next ? { startsAt: next.startsAt, endsAt: next.endsAt ?? null } : null,
    paymentDue,
    estimated,
  }
}
