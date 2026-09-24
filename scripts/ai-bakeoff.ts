#!/usr/bin/env tsx
/**
 * Mid-program redesign bake-off. Same request, same client data, many models,
 * outputs shuffled and labelled so the judging is blind.
 *
 *   npx tsx --env-file=.env.local scripts/ai-bakeoff.ts <outDir>
 *
 * Reads production (read only). Sends NO names, emails or health notes to any
 * model: only the session structure and the coach's request, which carries any
 * constraint the model needs. Writes results.json (with the model behind each
 * label) and blind.json (labels only) into <outDir>.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { PrismaClient } from "@prisma/client"
import { buildExerciseMatcher } from "../lib/exercise-match"

const OUT = process.argv[2]
if (!OUT) throw new Error("usage: ai-bakeoff.ts <outDir>")
mkdirSync(OUT, { recursive: true })

const prisma = new PrismaClient({ datasources: { db: { url: process.env.POSTGRES_URL_NON_POOLING } } })
const KEY = process.env.OPENROUTER_API_KEY
if (!KEY) throw new Error("OPENROUTER_API_KEY missing")

const MODELS = [
  "anthropic/claude-fable-5.1",
  "anthropic/claude-opus-5.5",
  "anthropic/claude-sonnet-5",
  "openai/gpt-6-sol-pro",
  "google/gemini-3.8-flash",
  "deepseek/deepseek-v4-pro-0813",
  "moonshotai/kimi-k3",
]
const SPEND_CAP = 9 // dollars; stop rather than overspend

const SYSTEM = `You are the programming assistant for a strength and conditioning coach. The coach asks you to change an existing training block that is already under way. You propose edits; the coach reviews them before anything reaches the client.

Rules:
- Change only what the request requires. Leave everything else exactly as it is.
- Only edit the sessions listed under EDITABLE SESSIONS. Never invent sessions or dates.
- Keep the coach's style: plain standard exercise names as they would appear in an exercise library, and prescriptions written the way the existing ones are (for example "3x8 @ RPE 7, rest 2 min").
- Keep the intent of each session and a sensible balance of pushing, pulling, legs and trunk.
- If the request cannot be satisfied fully, say so in warnings rather than quietly doing something else.

Reply with ONLY a JSON object, no other text:
{
  "summary": "one or two sentences on what you changed and why",
  "changes": [
    {
      "date": "YYYY-MM-DD",
      "session": "session name",
      "action": "replace" | "modify" | "remove" | "add",
      "exercise": "current exercise name, or null when adding",
      "newExercise": "replacement or added exercise name, or null",
      "newPrescription": "new prescription text, or null when removing",
      "reason": "short reason"
    }
  ],
  "warnings": ["anything the coach should double check"]
}`

type Session = { date: string; name: string; exercises: { name: string; rx: string }[] }

async function sessions(programLike: string, fromWeek: number, toWeek: number): Promise<{ list: Session[]; block: string }> {
  const program = await prisma.program.findFirstOrThrow({ where: { name: { contains: programLike }, isDraft: false, programType: "AI_GENERATED" }, select: { id: true, name: true, startDate: true } })
  const ws = await prisma.workout.findMany({
    where: { programId: program.id },
    orderBy: [{ scheduledDate: "asc" }, { order: "asc" }],
    select: { name: true, scheduledDate: true, exercises: { orderBy: { order: "asc" }, select: { name: true, prescription: true, exercise: { select: { name: true } } } } },
  })
  const day = 86_400_000
  const list = ws
    .filter((w) => {
      const wk = Math.floor((w.scheduledDate.getTime() - program.startDate.getTime()) / (7 * day)) + 1
      return wk >= fromWeek && wk <= toWeek
    })
    .map((w) => ({
      date: w.scheduledDate.toISOString().slice(0, 10),
      name: w.name,
      exercises: w.exercises.map((e) => ({ name: e.name ?? e.exercise?.name ?? "Exercise", rx: (e.prescription ?? "").replace(/\s+/g, " ").trim() })),
    }))
  return { list, block: program.name }
}

const render = (list: Session[]) =>
  list.map((s) => `${s.date}  ${s.name}\n${s.exercises.map((e) => `  - ${e.name}: ${e.rx}`).join("\n")}`).join("\n\n")

type Req = { id: string; title: string; program: string; weeks: [number, number]; context: string; ask: string; forbidden?: RegExp }

const REQUESTS: Req[] = [
  {
    id: "R1",
    title: "Shoulder flare-up",
    program: "Oly-to-Power",
    weeks: [3, 4],
    context: "16-week block, overhead stability and strength. Client is a recreational lifter. Weeks 1 and 2 are done. Now at the start of week 3.",
    ask: "Her right shoulder is irritated after this week. For the next two weeks, no overhead pressing and no wall walks or any handstand work. Keep the pulling, the legs, and the pressing volume from another angle. Change only what needs changing.",
    forbidden: /overhead|strict press|push press|jerk|handstand|wall walk|wall facing|snatch|pike|hspu|arnold|landmine press/i,
  },
  {
    id: "R2",
    title: "Travel week, hotel gym",
    program: "Climber's Base",
    weeks: [3, 3],
    context: "8 week climbing-support block: pull-up, pistol and handstand foundations. Weeks 1 and 2 are done. Now at the start of week 3.",
    ask: "He is travelling this week and only has a hotel gym: dumbbells up to 50 lb, one bench, a pull-up bar, floor space. Redesign this week's sessions for that. Keep the same intent for each day.",
  },
  {
    id: "R3",
    title: "Lifts feel too easy",
    program: "Oly-to-Power",
    weeks: [3, 5],
    context: "16-week block, overhead stability and strength. Weeks 1 and 2 are done. Now at the start of week 3.",
    ask: "Squat and deadlift have been easy. She reported RPE 5 to 6 on sets prescribed at RPE 7 for two weeks. Adjust back squat, romanian deadlift and conventional deadlift for weeks 3 to 5: intensity and rep scheme. Leave the deload weeks where they are and touch nothing else.",
  },
  {
    id: "R4",
    title: "Only 35 minutes now",
    program: "Climber's Base",
    weeks: [3, 4],
    context: "8 week climbing-support block: pull-up, pistol and handstand foundations. Weeks 1 and 2 are done. Now at the start of week 3.",
    ask: "His schedule changed and every session now has to fit in 35 minutes instead of about 60. Trim weeks 3 and 4 to fit without dropping the main pulling and skill work. Tell me exactly what you cut.",
  },
  {
    id: "R5",
    title: "Deload but keep the skill",
    program: "Oly-to-Power",
    weeks: [4, 4],
    context: "16-week block, overhead stability and strength. Weeks 1 to 3 are done. Now at the start of week 4.",
    ask: "Make this week a deload, but keep her handstand skill work at full quality. Her strength test in week 16 cannot move.",
  },
]

const stripFences = (s: string) => s.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()

async function call(model: string, user: string) {
  const body = (json: boolean) => ({
    model,
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
    max_tokens: 12000,
    usage: { include: true },
    ...(json ? { response_format: { type: "json_object" } } : {}),
  })
  const t = Date.now()
  for (const json of [true, false]) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body(json)),
      signal: AbortSignal.timeout(300_000),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e.message) }) as Response)
    const text = await res.text()
    if (!res.ok) {
      if (json && res.status === 400 && /response_format|json/i.test(text)) continue
      return { ok: false as const, error: `HTTP ${res.status} ${text.slice(0, 200)}`, ms: Date.now() - t }
    }
    const j = JSON.parse(text)
    const m = j.choices?.[0]
    return {
      ok: true as const,
      content: (m?.message?.content ?? "") as string,
      finish: m?.finish_reason as string,
      cost: (j.usage?.cost ?? 0) as number,
      tokensIn: j.usage?.prompt_tokens as number,
      tokensOut: j.usage?.completion_tokens as number,
      ms: Date.now() - t,
    }
  }
  return { ok: false as const, error: "no response", ms: Date.now() - t }
}

const shuffle = <T,>(a: T[]) => {
  const b = a.slice()
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

async function main() {
  const match = await buildExerciseMatcher(prisma as never)
  let spent = 0
  const results: Record<string, unknown>[] = []

  for (const r of REQUESTS) {
    const { list, block } = await sessions(r.program, r.weeks[0], r.weeks[1])
    const user = `BLOCK: ${block}\nCONTEXT: ${r.context}\n\nEDITABLE SESSIONS:\n${render(list)}\n\nCOACH REQUEST:\n${r.ask}`
    const dates = new Set(list.map((s) => s.date))
    console.log(`\n[${r.id}] ${r.title}: ${list.length} sessions, ${user.length} chars`)

    const labels = shuffle("ABCDEFGHIJ".split("").slice(0, MODELS.length))
    const runs = await Promise.all(
      MODELS.map(async (model, i) => {
        if (spent >= SPEND_CAP) return { model, label: labels[i], skipped: "spend cap reached" }
        const out = await call(model, user)
        if (out.ok) spent += out.cost
        console.log(`  ${model.padEnd(34)} ${out.ok ? `${(out.ms / 1000).toFixed(0)}s $${out.cost.toFixed(3)} ${out.finish}` : out.error}  (total $${spent.toFixed(2)})`)
        return { model, label: labels[i], ...out }
      })
    )

    for (const run of runs as any[]) {
      if (!run.ok) continue
      let parsed: any = null
      try {
        parsed = JSON.parse(stripFences(run.content))
      } catch {
        run.parseError = true
      }
      run.parsed = parsed
      if (!parsed || !Array.isArray(parsed.changes)) {
        run.checks = { validJson: false }
        continue
      }
      const ch = parsed.changes as any[]
      const added = ch.map((c) => c.newExercise).filter(Boolean) as string[]
      const matched = added.filter((n) => match(n))
      run.checks = {
        validJson: true,
        changes: ch.length,
        outOfScope: ch.filter((c) => !dates.has(c.date)).length,
        newExercises: added.length,
        inLibrary: matched.length,
        notInLibrary: added.filter((n) => !match(n)),
        ...(r.forbidden
          ? {
              // Objective for the shoulder request: nothing forbidden may be added,
              // and every forbidden exercise in the original must be dealt with.
              forbiddenAdded: added.filter((n) => r.forbidden!.test(n)),
              forbiddenLeft: list.flatMap((s) => s.exercises.filter((e) => r.forbidden!.test(e.name)).map((e) => ({ date: s.date, name: e.name })))
                .filter((x) => !ch.some((c) => c.date === x.date && c.exercise && c.exercise.toLowerCase() === x.name.toLowerCase() && c.action !== "modify")).length,
            }
          : {}),
      }
    }
    results.push({ request: r.id, title: r.title, ask: r.ask, sessions: list, runs })
  }

  writeFileSync(join(OUT, "results.json"), JSON.stringify({ spent, results }, null, 2))
  const blind = results.map((x: any) => ({
    request: x.request,
    title: x.title,
    ask: x.ask,
    outputs: x.runs.filter((y: any) => y.ok).map((y: any) => ({ label: y.label, parsed: y.parsed, raw: y.parsed ? undefined : y.content })).sort((a: any, b: any) => a.label.localeCompare(b.label)),
  }))
  writeFileSync(join(OUT, "blind.json"), JSON.stringify(blind, null, 2))
  console.log(`\nDone. Spent $${spent.toFixed(2)}. Wrote ${OUT}/results.json and blind.json`)
}

main()
  .catch((e) => console.log("ERR", String(e.message ?? e).split("\n").filter(Boolean).slice(-2).join(" | ")))
  .finally(() => prisma.$disconnect())
