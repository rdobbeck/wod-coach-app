import { noLongDashes } from "@/lib/text"
import type { Change } from "@/lib/ai/assist"
import type { Intent } from "@/lib/ai/check"

/**
 * The saved shape of an Ask AI conversation. It is the panel's Msg, minus
 * `failed` (transient) and anything we do not recognise. Bounds keep a row
 * small: 20 messages, 4000 chars of text, 60 changes of 300-char fields.
 * `workoutId` is "" only for a "create" (the session does not exist yet).
 */
export const THREAD_MAX_MESSAGES = 20
const MAX_TEXT = 4000
const MAX_CHANGES = 60
const MAX_EXERCISES = 20

export type ThreadChange = {
  action: Change["action"]
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
  exercises?: { name: string; prescription: string; libraryId: string | null; inLibrary: boolean }[]
  newDate?: string
  position?: "start"
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
  confirm?: { kind: "restate" | "question"; text: string; answered?: boolean }
  check?: { intent: Intent; clear: number; matches?: number }
}

const str = (v: unknown, max: number) => (typeof v === "string" ? noLongDashes(v).slice(0, max) : undefined)
const strs = (v: unknown, max: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter((x): x is string => !!x) : undefined)
const ACTIONS = new Set<string>(["replace", "modify", "remove", "add", "link", "create", "move", "delete"])
const INTENTS = new Set<string>(["question", "change_exercises", "schedule", "videos", "unclear"])
const unit = (v: unknown) => (typeof v === "number" && v >= 0 && v <= 1 ? v : undefined)

function exercises(v: unknown): ThreadChange["exercises"] {
  if (!Array.isArray(v)) return undefined
  const out: NonNullable<ThreadChange["exercises"]> = []
  for (const x of v.slice(0, MAX_EXERCISES)) {
    if (!x || typeof x !== "object") continue
    const e = x as Record<string, unknown>
    const name = str(e.name, 120)
    if (!name) continue
    out.push({
      name,
      prescription: str(e.prescription, 300) ?? "",
      libraryId: typeof e.libraryId === "string" ? e.libraryId.slice(0, 64) : null,
      inLibrary: e.inLibrary === true,
    })
  }
  return out
}

function change(v: unknown): ThreadChange | null {
  if (!v || typeof v !== "object") return null
  const c = v as Record<string, unknown>
  if (!ACTIONS.has(String(c.action)) || typeof c.workoutId !== "string" || typeof c.date !== "string") return null
  if (c.workoutId === "" && c.action !== "create") return null
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
    exercises: exercises(c.exercises),
    newDate: typeof c.newDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.newDate) ? c.newDate : undefined,
    position: c.position === "start" ? "start" : undefined,
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
    const cf = m.confirm as Record<string, unknown> | null | undefined
    if (cf && typeof cf === "object" && (cf.kind === "restate" || cf.kind === "question")) {
      const t = str(cf.text, 600)
      if (t !== undefined) msg.confirm = { kind: cf.kind, text: t, ...(typeof cf.answered === "boolean" ? { answered: cf.answered } : {}) }
    }
    const ck = m.check as Record<string, unknown> | null | undefined
    const clear = ck && typeof ck === "object" ? unit(ck.clear) : undefined
    if (ck && typeof ck === "object" && INTENTS.has(String(ck.intent)) && clear !== undefined) {
      const matches = unit(ck.matches)
      msg.check = { intent: ck.intent as Intent, clear, ...(matches !== undefined ? { matches } : {}) }
    }
    const warnings = strs(m.warnings, 400)
    if (warnings?.length) msg.warnings = warnings
    const dropped = strs(m.dropped, 400)
    if (dropped?.length) msg.dropped = dropped
    out.push(msg)
  }
  return out.slice(-THREAD_MAX_MESSAGES)
}
