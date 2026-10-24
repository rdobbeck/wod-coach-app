#!/usr/bin/env tsx
/**
 * Live eval of the Ask AI Jev checks. Runs labelled asks through the pre-check
 * and post-check against a fixed, made-up program (no database, no client
 * details) and exits 1 if any decision misses.
 *
 *   npx tsx --env-file=.env.local scripts/eval-ai-check.ts [runs=2]
 *
 * Each case runs `runs` times and must pass every time, so a threshold that
 * only passes on a lucky draw (Jev moves by up to about 0.08) still fails.
 * Each Jev call costs about $0.00003.
 */
import { askJev, type Question } from "../lib/ai/decide"
import { PRE_QUESTIONS, POST_QUESTIONS, preState, postState, changeLines, preDecision, postDecision, type Intent, type PreCheck } from "../lib/ai/check"
import type { Change, Context, Turn } from "../lib/ai/assist"

const RUNS = Number(process.argv[2] ?? 2)
if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY missing")

const session = (n: number, date: string, name: string) => ({ ref: `S${n}`, id: `w${n}`, date, name, exercises: [] })
const ctx: Context = {
  sessions: [
    session(1, "2026-10-26", "Full Body A"),
    session(2, "2026-10-28", "Swim"),
    session(3, "2026-10-29", "Full Body B"),
    session(4, "2026-11-02", "Full Body A"),
  ],
  profile: "",
  recent: "",
  today: "2026-10-24",
}

// Copied from the EXAMPLES_COACH and EXAMPLES_CLIENT lists in AiAssistant.tsx.
const EXAMPLES_COACH = [
  "Her shoulder is irritated. No overhead work for the next two weeks.",
  "He's travelling next week with only dumbbells and a bench.",
  "Squats have felt easy. Bump the next three weeks.",
]
const EXAMPLES_CLIENT = [
  "My shoulder is irritated. No overhead work for two weeks.",
  "I'm travelling next week with only dumbbells and a bench.",
  "Squats have felt easy. Bump the next three weeks.",
]

// `intent` is printed against what Jev picked but does not fail the eval; only decisions do.
type PreCase = { message: string; history?: Turn[]; expect: "proceed" | "confirm"; intent?: Intent }
const asked = (content: string): Turn[] => [{ role: "assistant", content }]
const PRE_CASES: PreCase[] = [
  ...[...EXAMPLES_COACH, ...EXAMPLES_CLIENT].map((message) => ({ message, expect: "proceed" as const })),
  { message: "Add a swim workout for today as a fresh workout. Keep it 20 minutes long", expect: "proceed", intent: "schedule" },
  { message: "I'm going swimming today. Can I have a 20-minute workout or swim?", expect: "proceed" },
  { message: "swap the back squat on monday for goblet squat 3x10", expect: "proceed" },
  { message: "move Thursday's session to Friday", expect: "proceed" },
  { message: "can you add videos to everything missing one", expect: "proceed" },
  { message: "what should I eat before training?", expect: "proceed" },
  { message: "tomorrow", history: asked("Do you want it today or tomorrow?"), expect: "proceed" },
  { message: "yes", history: asked("Want me to cancel Wednesday's swim?"), expect: "proceed" },
  { message: "make it better", expect: "confirm" },
  { message: "harder", expect: "confirm" },
  { message: "fix it", expect: "confirm" },
  { message: "change stuff", expect: "confirm" },
  { message: "do the thing we talked about", expect: "confirm" },
]

const swim: Change = {
  action: "create",
  workoutId: "",
  workoutName: "Swim: 20 min",
  date: "2026-10-24",
  exercises: [{ name: "Freestyle Swim", prescription: "20 min easy", libraryId: null, inLibrary: false }],
  reason: "",
}
const farmer: Change = { action: "remove", workoutId: "w3", workoutName: "Full Body B", date: "2026-10-29", exerciseId: "e31", exercise: "Farmer Carry", reason: "" }
const cancelSwim: Change = { action: "delete", workoutId: "w2", workoutName: "Swim: Efficiency Drills", date: "2026-10-28", reason: "" }
const swimTomorrow: Change = { ...swim, date: "2026-10-25" }
type PostCase = { message: string; history?: Turn[]; changes: Change[]; expect: "ok" | "retry" | "warn" }
const POST_CASES: PostCase[] = [
  { message: "Add a 20 minute swim today", changes: [], expect: "retry" },
  { message: "Add a 20 minute swim today", changes: [swim], expect: "ok" },
  { message: "swap monday's back squat for goblet squat", changes: [farmer], expect: "warn" },
  { message: "yes", history: asked("Want me to cancel Wednesday's swim?"), changes: [cancelSwim], expect: "ok" },
  { message: "tomorrow", history: asked("Do you want it today or tomorrow?"), changes: [swimTomorrow], expect: "ok" },
]

let calls = 0
let cost = 0
async function jev<K extends string>(state: unknown, questions: Record<K, Question>) {
  calls++
  const r = await askJev(state, questions, { timeoutMs: 15_000 })
  cost += r.costUsd
  return r.answers
}

async function preCheck(message: string, history: Turn[]): Promise<PreCheck> {
  const a = await jev(preState(ctx, message, history), PRE_QUESTIONS)
  if (a.intent.type !== "choice" || a.clear.type !== "noul") throw new Error("unexpected answer types")
  return { intent: a.intent.choice as Intent, intentP: a.intent.probabilities[a.intent.choice] ?? 0, clear: a.clear.noul }
}

type Row = { label: string; expect: string; got: string[]; pass: boolean }
const f = (n: number) => n.toFixed(2)

async function runPre(c: PreCase): Promise<Row> {
  const got: string[] = []
  let pass = true
  for (let i = 0; i < RUNS; i++) {
    try {
      const p = await preCheck(c.message, c.history ?? [])
      const d = preDecision(p)
      if (d !== c.expect) pass = false
      got.push(`${d} clear=${f(p.clear)} ${p.intent}=${f(p.intentP)}`)
    } catch (e) {
      pass = false
      got.push(`ERROR ${(e as Error).message}`)
    }
  }
  let label = c.history ? `${c.message}  [after: ${c.history[0].content}]` : c.message
  if (c.intent) label += `  [want intent: ${c.intent}]`
  return { label, expect: c.expect, got, pass }
}

async function runPost(c: PostCase): Promise<Row> {
  const got: string[] = []
  let pass = true
  for (let i = 0; i < RUNS; i++) {
    try {
      // As in the route: the pre-check's intent feeds the post decision.
      const p = await preCheck(c.message, c.history ?? [])
      const a = await jev(postState(c.message, c.history ?? [], c.changes), POST_QUESTIONS)
      if (a.matches.type !== "noul") throw new Error("unexpected answer type")
      const d = postDecision(p.intent, a.matches.noul, c.changes.length)
      if (d !== c.expect) pass = false
      got.push(`${d} matches=${f(a.matches.noul)} ${p.intent}=${f(p.intentP)}`)
    } catch (e) {
      pass = false
      got.push(`ERROR ${(e as Error).message}`)
    }
  }
  const after = c.history ? `  [after: ${c.history[0].content}]` : ""
  const label = `${c.message}${after}  [changes: ${changeLines(c.changes) || "none"}]`
  return { label, expect: c.expect, got, pass }
}

async function main() {
  const rows = await Promise.all([...PRE_CASES.map(runPre), ...POST_CASES.map(runPost)])
  const width = Math.max(...rows.map((r) => r.label.length))
  console.log(`${"case".padEnd(width)} | expect  | ${Array.from({ length: RUNS }, (_, i) => `run ${i + 1}`.padEnd(42)).join(" | ")} | pass`)
  for (const r of rows) {
    console.log(`${r.label.padEnd(width)} | ${r.expect.padEnd(7)} | ${r.got.map((g) => g.padEnd(42)).join(" | ")} | ${r.pass ? "yes" : "NO"}`)
  }
  const misses = rows.filter((r) => !r.pass).length
  console.log(`\n${rows.length - misses}/${rows.length} cases pass over ${RUNS} runs. ${calls} Jev calls, $${cost.toFixed(5)}.`)
  process.exit(misses ? 1 : 0)
}

main()
