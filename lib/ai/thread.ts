import { noLongDashes } from "@/lib/text"

/**
 * The saved shape of an Ask AI conversation. It is the panel's Msg, minus
 * `failed` (transient) and anything we do not recognise. Bounds keep a row
 * small: 20 messages, 4000 chars of text, 60 changes of 300-char fields.
 */
export const THREAD_MAX_MESSAGES = 20
const MAX_TEXT = 4000
const MAX_CHANGES = 60

export type ThreadChange = {
  action: "replace" | "modify" | "remove" | "add"
  workoutId: string
  workoutName: string
  date: string
  exerciseId?: string
  exercise?: string
  currentPrescription?: string
  newExercise?: string
  newPrescription?: string
  libraryId?: string | null
  inLibrary?: boolean
  reason: string
}
export type ThreadMsg = {
  role: "user" | "assistant"
  text: string
  changes?: ThreadChange[]
  warnings?: string[]
  dropped?: string[]
  picked?: boolean[]
  state?: "pending" | "applied" | "discarded"
  changeSetId?: string | null
  undone?: boolean
  applyNote?: string
}

const str = (v: unknown, max: number) => (typeof v === "string" ? noLongDashes(v).slice(0, max) : undefined)
const strs = (v: unknown, max: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter((x): x is string => !!x) : undefined)
const ACTIONS = new Set(["replace", "modify", "remove", "add"])

function change(v: unknown): ThreadChange | null {
  if (!v || typeof v !== "object") return null
  const c = v as Record<string, unknown>
  if (!ACTIONS.has(String(c.action)) || typeof c.workoutId !== "string" || typeof c.date !== "string") return null
  return {
    action: c.action as ThreadChange["action"],
    workoutId: c.workoutId.slice(0, 64),
    workoutName: str(c.workoutName, 200) ?? "",
    date: c.date.slice(0, 10),
    exerciseId: str(c.exerciseId, 64),
    exercise: str(c.exercise, 200),
    currentPrescription: str(c.currentPrescription, 300),
    newExercise: str(c.newExercise, 200),
    newPrescription: str(c.newPrescription, 300),
    libraryId: typeof c.libraryId === "string" ? c.libraryId.slice(0, 64) : c.libraryId === null ? null : undefined,
    inLibrary: typeof c.inLibrary === "boolean" ? c.inLibrary : undefined,
    reason: str(c.reason, 300) ?? "",
  }
}

/** Keep only what we store, bounded, newest 20. Throws on a non-array so the route can say 400. */
export function sanitizeMessages(input: unknown): ThreadMsg[] {
  if (!Array.isArray(input)) throw new Error("messages must be an array")
  const out: ThreadMsg[] = []
  for (const v of input) {
    if (!v || typeof v !== "object") continue
    const m = v as Record<string, unknown>
    if (m.failed) continue
    if (m.role !== "user" && m.role !== "assistant") continue
    const text = str(m.text, MAX_TEXT)
    if (text === undefined) continue
    const changes = Array.isArray(m.changes) ? m.changes.slice(0, MAX_CHANGES).map(change).filter((c): c is ThreadChange => !!c) : undefined
    const msg: ThreadMsg = { role: m.role, text }
    if (changes?.length) {
      msg.changes = changes
      msg.picked = Array.isArray(m.picked) ? changes.map((_, i) => (m.picked as unknown[])[i] === true) : changes.map(() => true)
      msg.state = m.state === "applied" || m.state === "discarded" ? m.state : "pending"
      if (typeof m.changeSetId === "string") msg.changeSetId = m.changeSetId.slice(0, 64)
      if (m.undone === true) msg.undone = true
      const note = str(m.applyNote, 300)
      if (note) msg.applyNote = note
    }
    const warnings = strs(m.warnings, 400)
    if (warnings?.length) msg.warnings = warnings
    const dropped = strs(m.dropped, 400)
    if (dropped?.length) msg.dropped = dropped
    out.push(msg)
  }
  return out.slice(-THREAD_MAX_MESSAGES)
}
