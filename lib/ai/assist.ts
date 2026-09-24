import { prisma } from "@/lib/prisma"
import { buildExerciseMatcher } from "@/lib/exercise-match"
import { noLongDashes } from "@/lib/text"
import { dayKey, summarizeEntry } from "@/lib/training-format"

/**
 * The always-open AI box on a client's page. The coach types a question or a
 * change ("her shoulder is cranky, no overhead for two weeks") and gets an
 * answer plus, when it is a change, a list of exact edits to review. Nothing is
 * written until the coach applies them (see apply.ts).
 *
 * The model is Sonnet 5 unless AI_ASSIST_MODEL says otherwise. It is only ever
 * shown session structure, goals, equipment, injury notes and recent results:
 * no names, emails or contact details.
 */
export const ASSIST_MODEL = () => process.env.AI_ASSIST_MODEL || "anthropic/claude-sonnet-5"

// $ per million tokens, used only when OpenRouter does not report a cost.
const PRICE: Record<string, [number, number]> = { "anthropic/claude-sonnet-5": [2, 10] }
const FALLBACK_PRICE: [number, number] = [10, 50] // assume the priciest model rather than undercount

const MAX_OUTPUT_TOKENS = 12000
const MAX_SESSIONS = 40
const MAX_CHANGES = 60

export type CtxExercise = { ref: string; id: string; name: string; rx: string; locked: boolean }
export type CtxSession = { ref: string; id: string; date: string; name: string; exercises: CtxExercise[] }
export type Context = { sessions: CtxSession[]; profile: string; recent: string }

/** Sessions the assistant may edit: not done, from today on. Exercises with logged sets are locked. */
export async function buildContext(clientId: string): Promise<Context> {
  const todayStart = new Date(`${dayKey(new Date())}T00:00:00.000Z`)
  const [workouts, profile, logs] = await Promise.all([
    prisma.workout.findMany({
      where: { clientId, isCompleted: false, scheduledDate: { gte: todayStart } },
      orderBy: [{ scheduledDate: "asc" }, { order: "asc" }],
      take: MAX_SESSIONS,
      select: {
        id: true,
        name: true,
        scheduledDate: true,
        exercises: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            name: true,
            prescription: true,
            exercise: { select: { name: true } },
            _count: { select: { setLogs: true, exerciseLogs: true } },
          },
        },
      },
    }),
    prisma.clientProfile.findUnique({ where: { userId: clientId }, select: { goals: true, injuries: true, equipment: true, units: true } }),
    prisma.exerciseLog.findMany({
      where: { userId: clientId },
      orderBy: { performedAt: "desc" },
      take: 40,
      select: {
        performedAt: true,
        resultText: true,
        rpe: true,
        setLogs: { orderBy: { setNumber: "asc" }, select: { setNumber: true, reps: true, weight: true, rpe: true } },
        workoutExercise: { select: { name: true, exercise: { select: { name: true } } } },
      },
    }),
  ])

  const sessions: CtxSession[] = workouts.map((w, i) => ({
    ref: `s${i + 1}`,
    id: w.id,
    date: dayKey(w.scheduledDate),
    name: w.name,
    exercises: w.exercises.map((e, j) => ({
      ref: `s${i + 1}e${j + 1}`,
      id: e.id,
      name: e.name ?? e.exercise?.name ?? "Exercise",
      rx: (e.prescription ?? "").replace(/\s+/g, " ").trim(),
      locked: e._count.setLogs > 0 || e._count.exerciseLogs > 0,
    })),
  }))

  const profileText = [
    profile?.goals?.length ? `Goals: ${profile.goals.join(", ")}` : null,
    profile?.injuries ? `Injuries and notes: ${profile.injuries}` : null,
    profile?.equipment?.length ? `Equipment: ${profile.equipment.join(", ")}` : null,
    `Units: ${profile?.units ?? "lb"}`,
  ]
    .filter(Boolean)
    .join("\n")

  const recent = logs
    .map((l) => {
      const s = summarizeEntry({ resultText: l.resultText, rpe: l.rpe, sets: l.setLogs }, profile?.units ?? "lb")
      return s ? `${dayKey(l.performedAt)}  ${l.workoutExercise.name ?? l.workoutExercise.exercise?.name ?? "Exercise"}: ${s}` : null
    })
    .filter(Boolean)
    .join("\n")

  return { sessions, profile: profileText, recent }
}

const SYSTEM = `You are the programming assistant built into a strength coach's client page. The coach can ask you a question or ask you to change the client's upcoming training. You propose; the coach reviews every change before anything is saved.

Rules:
- If the message is only a question, answer it and return no changes.
- If it asks for a change, change only what the request requires and leave everything else alone.
- Only touch sessions and exercises listed below, and refer to them only by their ref codes (s3 for a session, s3e2 for an exercise). Exercises marked LOCKED already have logged sets and cannot be changed.
- Actions: "replace" (ref is an exercise), "modify" (ref is an exercise, prescription only), "remove" (ref is an exercise), "add" (ref is a session; the exercise is added at the end).
- Write exercise names the way a coach would list them in an exercise library: plain standard names, no brand names, no invented variations.
- Write prescriptions in the same format as the existing ones (for example "3x8 @ RPE 7, rest 2 min").
- Keep the intent of each session and a sensible balance of pushing, pulling, legs and trunk.
- Respect the client's injuries and equipment.
- If the request cannot be fully met, say so plainly in "warnings". If it is unclear, ask one short question in "reply" and return no changes.
- Never use em dashes or en dashes.

Reply with ONLY a JSON object:
{
  "reply": "what you did or the answer, in two or three plain sentences",
  "changes": [
    { "action": "replace" | "modify" | "remove" | "add", "ref": "s3e2", "newExercise": "name or null", "newPrescription": "text or null", "reason": "short reason" }
  ],
  "warnings": ["anything the coach should double check"]
}`

const render = (ctx: Context) =>
  [
    `CLIENT\n${ctx.profile}`,
    `RECENT RESULTS (newest first)\n${ctx.recent || "none logged yet"}`,
    `EDITABLE SESSIONS\n${
      ctx.sessions.length
        ? ctx.sessions
            .map((s) => `${s.ref}  ${s.date}  ${s.name}\n${s.exercises.map((e) => `  ${e.ref}${e.locked ? " LOCKED" : ""}  ${e.name}: ${e.rx || "no prescription"}`).join("\n")}`)
            .join("\n\n")
        : "none: the client has no upcoming sessions"
    }`,
  ].join("\n\n")

export type Turn = { role: "user" | "assistant"; content: string }

export type ModelResult = { content: string; costUsd: number; tokensIn: number; tokensOut: number; model: string; finish: string }

export async function callModel(ctx: Context, message: string, history: Turn[] = []): Promise<ModelResult> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error("The AI assistant is not configured (no OpenRouter key).")
  const model = ASSIST_MODEL()
  const body = {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    usage: { include: true },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: render(ctx) },
      { role: "assistant", content: "Understood. I have the client's sessions and will refer to them by ref." },
      ...history.slice(-6).map((t) => ({ role: t.role, content: t.content.slice(0, 2000) })),
      { role: "user", content: message },
    ],
  }
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(110_000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`The AI service returned ${res.status}. Try again in a moment.`)
  const j = JSON.parse(text)
  const tokensIn = j.usage?.prompt_tokens ?? 0
  const tokensOut = j.usage?.completion_tokens ?? 0
  const [pin, pout] = PRICE[model] ?? FALLBACK_PRICE
  const costUsd = typeof j.usage?.cost === "number" ? j.usage.cost : (tokensIn * pin + tokensOut * pout) / 1e6
  return { content: j.choices?.[0]?.message?.content ?? "", costUsd, tokensIn, tokensOut, model, finish: j.choices?.[0]?.finish_reason ?? "" }
}

// ---------- validation ----------

export type Change = {
  action: "replace" | "modify" | "remove" | "add"
  workoutId: string
  workoutName: string
  date: string
  exerciseId?: string // the row being replaced, modified or removed
  exercise?: string // its current name
  currentPrescription?: string
  newExercise?: string
  newPrescription?: string
  libraryId?: string | null
  inLibrary?: boolean // false: no demo video exists for it
  reason: string
}
export type Proposal = {
  reply: string
  changes: Change[]
  warnings: string[]
  dropped: string[]
  /** Every change is a load bump, so the panel may apply it without asking. */
  autoApply: boolean
}

/** "3x8 @ RPE 7" -> "3x8". Null when the prescription does not start with sets x reps. */
const scheme = (rx: string) => {
  const m = rx.match(/^\s*(\d+)\s*[x\u00d7]\s*(\d+(?:\s*-\s*\d+)?)/i)
  return m ? `${m[1]}x${m[2].replace(/\s+/g, "")}` : null
}

/**
 * A load bump changes how hard an exercise is, not what it is or how it is
 * structured: same movement, same sets and reps, different prescription text
 * (RPE, load, rest). Anything else is a redesign and waits for the coach.
 */
export const isLoadBump = (c: Change) =>
  c.action === "modify" &&
  !!c.currentPrescription &&
  !!c.newPrescription &&
  c.currentPrescription !== c.newPrescription &&
  scheme(c.currentPrescription) !== null &&
  scheme(c.currentPrescription) === scheme(c.newPrescription)

const MAX_AUTO_CHANGES = 40
export const canAutoApply = (changes: Change[]) => changes.length > 0 && changes.length <= MAX_AUTO_CHANGES && changes.every(isLoadBump)

let matcherCache: { at: number; match: Awaited<ReturnType<typeof buildExerciseMatcher>> } | null = null
export async function libraryMatcher() {
  if (!matcherCache || Date.now() - matcherCache.at > 10 * 60_000) {
    matcherCache = { at: Date.now(), match: await buildExerciseMatcher(prisma as never) }
  }
  return matcherCache.match
}

const stripFences = (s: string) => s.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? noLongDashes(v.trim()).slice(0, max) : undefined)

/**
 * Turn the model's raw answer into edits that are safe to show. Anything that
 * points at a session or exercise that does not exist, or that is locked, or
 * that is missing what the action needs, is dropped and reported rather than
 * shown. A reply that is not JSON at all is kept as plain text with no edits.
 */
export function parseProposal(
  raw: string,
  ctx: Context,
  match: (name: string) => string | null,
  libraryName: (id: string) => string | null
): Proposal {
  let j: any
  try {
    j = JSON.parse(stripFences(raw))
  } catch {
    return { reply: noLongDashes(raw.trim()).slice(0, 2000) || "I could not put together an answer. Try rephrasing.", changes: [], warnings: [], dropped: [], autoApply: false }
  }
  const sessions = new Map(ctx.sessions.map((s) => [s.ref, s]))
  const exercises = new Map(ctx.sessions.flatMap((s) => s.exercises.map((e) => [e.ref, { e, s }] as const)))
  const dropped: string[] = []
  const changes: Change[] = []
  const touched = new Set<string>()

  for (const c of Array.isArray(j?.changes) ? j.changes : []) {
    if (changes.length >= MAX_CHANGES) {
      dropped.push("More than 60 changes were suggested; the rest were left out.")
      break
    }
    const action = c?.action
    const ref = typeof c?.ref === "string" ? c.ref.trim() : ""
    const reason = str(c?.reason, 300) ?? ""
    const newExercise = str(c?.newExercise, 120)
    const newPrescription = str(c?.newPrescription, 300)

    if (action === "add") {
      const s = sessions.get(ref)
      if (!s || !newExercise || !newPrescription) {
        dropped.push(`An addition (${ref || "no ref"}) was incomplete.`)
        continue
      }
      const id = match(newExercise)
      changes.push({ action, workoutId: s.id, workoutName: s.name, date: s.date, newExercise: (id && libraryName(id)) || newExercise, newPrescription, libraryId: id, inLibrary: !!id, reason })
      continue
    }
    if (action !== "replace" && action !== "modify" && action !== "remove") {
      dropped.push(`A change with an unknown action was left out.`)
      continue
    }
    const hit = exercises.get(ref)
    if (!hit) {
      dropped.push(`A change pointed at ${ref || "nothing"}, which is not one of this client's upcoming exercises.`)
      continue
    }
    if (hit.e.locked) {
      dropped.push(`${hit.e.name} on ${hit.s.date} already has logged sets, so it was left alone.`)
      continue
    }
    if (touched.has(hit.e.id)) {
      dropped.push(`${hit.e.name} on ${hit.s.date} was changed twice; only the first change was kept.`)
      continue
    }
    if ((action === "replace" && !newExercise) || (action === "modify" && !newPrescription)) {
      dropped.push(`A change to ${hit.e.name} on ${hit.s.date} was incomplete.`)
      continue
    }
    touched.add(hit.e.id)
    const base = { workoutId: hit.s.id, workoutName: hit.s.name, date: hit.s.date, exerciseId: hit.e.id, exercise: hit.e.name, currentPrescription: hit.e.rx, reason }
    if (action === "replace") {
      const id = match(newExercise!)
      changes.push({ ...base, action, newExercise: (id && libraryName(id)) || newExercise, newPrescription: newPrescription ?? hit.e.rx, libraryId: id, inLibrary: !!id })
    } else if (action === "modify") {
      changes.push({ ...base, action, newPrescription })
    } else {
      changes.push({ ...base, action })
    }
  }

  const warnings = (Array.isArray(j?.warnings) ? j.warnings : []).map((w: unknown) => str(w, 400)).filter(Boolean) as string[]
  return {
    reply: str(j?.reply, 2000) ?? (changes.length ? "Here are the changes I'd make." : "Nothing to change."),
    changes,
    warnings,
    dropped,
    // A warning means the model wants a human to look, so it never applies on its own.
    autoApply: canAutoApply(changes) && warnings.length === 0,
  }
}
