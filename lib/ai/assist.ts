import { prisma } from "@/lib/prisma"
import { buildExerciseMatcher } from "@/lib/exercise-match"
import { noLongDashes } from "@/lib/text"
import { dayKey, summarizeEntry } from "@/lib/training-format"
import { measureOfLogged } from "@/lib/training"

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

// Per call. A big program is asked about in parts (splitContext), so one part never needs more.
const MAX_OUTPUT_TOKENS = 8000
// Sessions per call: about 8 exercises each keeps one part's answer to roughly 25 seconds.
const SESSIONS_PER_PART = 4
const MAX_SESSIONS = 40
const MAX_CHANGES = 60 // per part
export const MAX_MERGED_CHANGES = 150 // a whole program, after merging parts; apply.ts honors the same ceiling
const MAX_CREATE_EXERCISES = 20

export type CtxExercise = {
  ref: string
  id: string
  name: string
  rx: string
  locked: boolean
  /** Linked to a library entry that has a demo video. */
  hasVideo: boolean
  /** For rows without a video: library names with a video that look like this one. */
  suggestions?: string[]
}
export type CtxSession = { ref: string; id: string; date: string; name: string; exercises: CtxExercise[] }
export type Context = {
  sessions: CtxSession[]
  profile: string
  recent: string
  today: string
  /** Set when a big program is asked about in parts: which part this is, and the sessions the other parts hold. */
  part?: { index: number; total: number }
  others?: { date: string; name: string }[]
}

/**
 * A program with many upcoming sessions is too much to rewrite in one model
 * answer (a full audit of 14 sessions ran past both the token ceiling and the
 * route's time limit). Split it into parts of four sessions, asked in parallel.
 * Refs stay the same, so each part's answer is parsed exactly as before.
 */
export function splitContext(ctx: Context, size = SESSIONS_PER_PART): Context[] {
  if (ctx.sessions.length <= size) return [ctx]
  const total = Math.ceil(ctx.sessions.length / size)
  return Array.from({ length: total }, (_, index) => {
    const mine = ctx.sessions.slice(index * size, (index + 1) * size)
    const others = ctx.sessions.filter((s) => !mine.includes(s)).map((s) => ({ date: s.date, name: s.name }))
    return { ...ctx, sessions: mine, part: { index, total }, others }
  })
}

// Rows without a video that get library suggestions, so a long block cannot balloon the prompt.
const MAX_SUGGESTED_ROWS = 80

/** Sessions the assistant may edit: not done, from today on. Exercises with logged sets are locked. */
export async function buildContext(clientId: string): Promise<Context> {
  const todayStart = new Date(`${dayKey(new Date())}T00:00:00.000Z`)
  const [workouts, profile, logs, match] = await Promise.all([
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
            exercise: { select: { name: true, videoUrl: true } },
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
        workoutExercise: { select: { name: true, prescription: true, reps: true, exercise: { select: { name: true, tracking: true } } } },
      },
    }),
    libraryMatcher(),
  ])

  let suggested = 0
  const sessions: CtxSession[] = workouts.map((w, i) => ({
    ref: `s${i + 1}`,
    id: w.id,
    date: dayKey(w.scheduledDate),
    name: w.name,
    exercises: w.exercises.map((e, j) => {
      const name = e.name ?? e.exercise?.name ?? "Exercise"
      const hasVideo = !!e.exercise?.videoUrl
      const row: CtxExercise = {
        ref: `s${i + 1}e${j + 1}`,
        id: e.id,
        name,
        rx: (e.prescription ?? "").replace(/\s+/g, " ").trim(),
        locked: e._count.setLogs > 0 || e._count.exerciseLogs > 0,
        hasVideo,
      }
      if (!hasVideo && !row.locked && suggested < MAX_SUGGESTED_ROWS) {
        const s = match.suggest(name)
        if (s.length) {
          row.suggestions = s
          suggested++
        }
      }
      return row
    }),
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
      const s = summarizeEntry(
        // "90 lb × 30 m" for a carry, "60s" for a hold, so the model doesn't read either as reps.
        { resultText: l.resultText, rpe: l.rpe, sets: l.setLogs, measure: measureOfLogged(l.workoutExercise) },
        profile?.units ?? "lb"
      )
      return s ? `${dayKey(l.performedAt)}  ${l.workoutExercise.name ?? l.workoutExercise.exercise?.name ?? "Exercise"}: ${s}` : null
    })
    .filter(Boolean)
    .join("\n")

  return { sessions, profile: profileText, recent, today: dayKey(new Date()) }
}

const SYSTEM = `You are the programming assistant built into a strength coach's client page. The coach can ask you a question or ask you to change the client's upcoming training. You propose; the coach reviews every change before anything is saved.

Rules:
- If the message is only a question, answer it and return no changes.
- If it asks for a change, change only what the request requires and leave everything else alone.
- Only touch sessions and exercises listed below, and refer to them only by their ref codes (s3 for a session, s3e2 for an exercise). Exercises marked LOCKED already have logged sets and cannot be changed.
- Actions: "replace" (ref is an exercise), "modify" (ref is an exercise, prescription only), "remove" (ref is an exercise), "add" (ref is a session; the exercise is added at the end), "link" (ref is an exercise; attach a demo video, see below), "create" (a whole new session on a date, see below).
- Demo videos come from the coach's exercise library. An exercise gets its video by being linked to a library entry whose name matches, so names matter. Exercises marked NO VIDEO are not linked to one; some list the closest library names in quotes.
- When asked to add, attach or fix videos, use "link": keep the exercise as it is and put the library name to try in "newExercise", with up to four more names to try in order in "candidates". Prefer names listed in quotes beside the exercise; otherwise try plain standard names and common variations. Rows with no library names listed may well have no video in the library; try anyway and say so in "warnings".
- "create" makes a new standalone session: give "date" (YYYY-MM-DD, today or later), "name" (short, like "Swim: Efficiency Drills"), and "exercises" as a list of { "name", "prescription" }. Use it when the request needs a session that does not exist yet (a new weekly session, a block of sessions, a day the client has nothing on). One create per session; for "weekly" make one per week for the span asked, or four weeks if no span was given. Prefer days with no session unless the request names a day. Never create on a date that already has a session unless the request says to.
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
    { "action": "replace" | "modify" | "remove" | "add" | "link", "ref": "s3e2", "newExercise": "name or null", "newPrescription": "text or null", "candidates": ["more library names to try, link only"], "reason": "short reason" },
    { "action": "create", "date": "2026-10-14", "name": "session name", "exercises": [{ "name": "exercise", "prescription": "3x8 @ RPE 7, rest 2 min" }], "reason": "short reason" }
  ],
  "warnings": ["anything the coach should double check"]
}`

export const renderContext = (ctx: Context) =>
  [
    ctx.part
      ? `PART ${ctx.part.index + 1} OF ${ctx.part.total}. The program is too big for one answer, so you are handling only the sessions listed under EDITABLE SESSIONS; the other parts are handled separately with the same request. Apply the request fully to your sessions, the same way you would across the whole program.${
          ctx.part.index > 0 ? ' Do not use "create" in this part. Keep "reply" to one short sentence.' : ""
        }`
      : null,
    `TODAY ${ctx.today}`,
    `CLIENT\n${ctx.profile}`,
    `RECENT RESULTS (newest first)\n${ctx.recent || "none logged yet"}`,
    `EDITABLE SESSIONS\n${
      ctx.sessions.length
        ? ctx.sessions
            .map(
              (s) =>
                `${s.ref}  ${s.date}  ${s.name}\n${s.exercises
                  .map(
                    (e) =>
                      `  ${e.ref}${e.locked ? " LOCKED" : ""}${e.hasVideo ? "" : " NO VIDEO"}  ${e.name}: ${e.rx || "no prescription"}${
                        e.suggestions?.length ? `  (library: ${e.suggestions.map((n) => `"${n}"`).join(", ")})` : ""
                      }`
                  )
                  .join("\n")}`
            )
            .join("\n\n")
        : "none: the client has no upcoming sessions"
    }`,
    ctx.others?.length ? `OTHER UPCOMING SESSIONS (handled in other parts, not editable here)\n${ctx.others.map((o) => `  ${o.date}  ${o.name}`).join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n")

export type Turn = { role: "user" | "assistant"; content: string }

export type ModelResult = { content: string; costUsd: number; tokensIn: number; tokensOut: number; model: string; finish: string }

export async function callModel(ctx: Context, message: string, history: Turn[] = []): Promise<ModelResult> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error("The AI assistant is not configured (no OpenRouter key).")
  const model = ASSIST_MODEL()
  const body = {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    // The model thinks at length by default, which used most of the token budget and over a minute
    // per call on big asks. Edits to a program don't need it; AI_ASSIST_REASONING can raise it.
    reasoning: { effort: process.env.AI_ASSIST_REASONING || "low" },
    usage: { include: true },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: renderContext(ctx) },
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

export type CreateExercise = { name: string; prescription: string; libraryId: string | null; inLibrary: boolean }
export type Change = {
  action: "replace" | "modify" | "remove" | "add" | "link" | "create"
  workoutId: string // "" for a session that does not exist yet ("create")
  workoutName: string
  date: string
  exerciseId?: string // the row being replaced, modified, removed or linked
  exercise?: string // its current name
  currentPrescription?: string
  newExercise?: string // for "link": the library entry whose video is attached; the row keeps its own name
  newPrescription?: string
  libraryId?: string | null
  inLibrary?: boolean // false: no demo video exists for it
  exercises?: CreateExercise[] // "create" only: the new session's exercises in order
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
/** Call after the library changes so the next ask sees the new entry or video, not a ten-minute-old list. */
export function invalidateLibraryMatcher() {
  matcherCache = null
}
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
  libraryName: (id: string) => string | null,
  hasVideo: (id: string) => boolean = () => true
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

    if (action === "create") {
      const date = typeof c?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.date.trim()) ? c.date.trim() : null
      if (!date) {
        dropped.push("A new session had no date in the form YYYY-MM-DD.")
        continue
      }
      if (date < ctx.today) {
        dropped.push(`A new session on ${date} is in the past, so it was left out.`)
        continue
      }
      const name = str(c?.name, 120)
      if (!name) {
        dropped.push(`A new session on ${date} had no name.`)
        continue
      }
      const exercises: CreateExercise[] = (Array.isArray(c?.exercises) ? c.exercises : [])
        .slice(0, MAX_CREATE_EXERCISES)
        .map((x: unknown) => {
          const o = (x ?? {}) as { name?: unknown; prescription?: unknown }
          const n = str(o.name, 120)
          const rx = str(o.prescription, 300)
          if (!n || !rx) return null
          const id = match(n)
          return { name: (id && libraryName(id)) || n, prescription: rx, libraryId: id, inLibrary: !!id }
        })
        .filter((x: CreateExercise | null): x is CreateExercise => !!x)
      if (!exercises.length) {
        dropped.push(`A new session (${name}) had no complete exercises.`)
        continue
      }
      changes.push({ action, workoutId: "", workoutName: name, date, exercises, reason })
      continue
    }
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
    if (action !== "replace" && action !== "modify" && action !== "remove" && action !== "link") {
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
    // Names to try for a video link, in the model's order, cleaned and deduplicated.
    const candidates = Array.from(
      new Set([newExercise, ...(Array.isArray(c?.candidates) ? c.candidates.slice(0, 4) : []).map((n: unknown) => str(n, 120))].filter(Boolean) as string[])
    )
    if ((action === "replace" && !newExercise) || (action === "modify" && !newPrescription) || (action === "link" && !candidates.length)) {
      dropped.push(`A change to ${hit.e.name} on ${hit.s.date} was incomplete.`)
      continue
    }
    const base = { workoutId: hit.s.id, workoutName: hit.s.name, date: hit.s.date, exerciseId: hit.e.id, exercise: hit.e.name, currentPrescription: hit.e.rx, reason }
    if (action === "link") {
      // Only a library entry with a video is worth linking; the first name that reaches one wins.
      const id = candidates.map((n) => match(n)).find((i): i is string => !!i && hasVideo(i)) ?? null
      if (!id) {
        dropped.push(`No library video matched ${hit.e.name} on ${hit.s.date} (tried: ${candidates.join(", ")}).`)
        continue
      }
      touched.add(hit.e.id)
      changes.push({ ...base, action, newExercise: libraryName(id) ?? candidates[0], libraryId: id, inLibrary: true })
      continue
    }
    touched.add(hit.e.id)
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

/**
 * One proposal from the answers to each part (null = that part's call failed).
 * The first part's reply speaks for the whole; only the first part may create
 * sessions, so a parallel part can never add duplicates.
 */
export function mergeProposals(parts: (Proposal | null)[]): Proposal {
  const changes: Change[] = []
  const warnings: string[] = []
  const dropped: string[] = []
  let reply = ""
  parts.forEach((p, i) => {
    if (!p) {
      dropped.push(`Part ${i + 1} of the program could not be reached; ask again for those sessions.`)
      return
    }
    if (!reply && p.reply && (i === 0 || p.changes.length)) reply = p.reply
    for (const c of p.changes) {
      if (c.action === "create" && i > 0) {
        dropped.push(`A new session suggested for part ${i + 1} was left out (only the first part may add sessions).`)
        continue
      }
      changes.push(c)
    }
    for (const w of p.warnings) if (!warnings.includes(w)) warnings.push(w)
    dropped.push(...p.dropped)
  })
  return {
    reply: reply || (changes.length ? "Here are the changes I'd make." : "Nothing to change."),
    changes: changes.slice(0, MAX_MERGED_CHANGES),
    warnings,
    dropped,
    autoApply: canAutoApply(changes) && warnings.length === 0,
  }
}
