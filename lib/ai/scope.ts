import { noLongDashes } from "@/lib/text"
import type { Context, Turn } from "@/lib/ai/assist"
import { dayNames, weekRanges } from "@/lib/ai/days"
import { recentTurns } from "@/lib/ai/check"

/**
 * Which upcoming sessions an ask is about, decided once over the whole program.
 *
 * A big program is asked about in parts of four, and a part only sees its own
 * sessions, so "on Friday" or "next week" was read by each part as its own
 * Friday or week: one removal landed on two Fridays, "easier next week" on
 * five sessions. A fast model that sees every session's date and name picks
 * the ones meant, and only those are sent to be edited, usually few enough
 * that there are no parts at all. Jev was tried first and could not tell the
 * next Friday from a later one reliably. Any failure leaves the program as it was.
 */
export const SCOPE_MODEL = () => process.env.AI_SCOPE_MODEL || "anthropic/claude-haiku-5.5"

const weekday = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })

const SYSTEM = `You pick which of a client's upcoming training sessions a message from their coach (or from the client) is about.
Day names and "next week" mean the dates in day_names, counted from today: "Friday" is the next Friday only, unless the message says every, each or all. "This week" and "next week" mean the dates in weeks. "The last week" is the last 7 days of the program.
Also include any session the message refers to without changing it ("make Friday the same as Monday", "copy Wednesday"), because only the sessions you pick are shown in full.
Reply only with JSON:
{"refs": ["s3"]} for the sessions the message asks to change, asks about or refers to,
{"refs": "all"} when it is about the whole program or every session,
{"refs": []} when it is about no existing session (a new session, a day with nothing on it, or a general question).`

export function scopeState(ctx: Context, message: string, history: Turn[]) {
  return {
    today: ctx.today,
    day_names: dayNames(ctx.today),
    weeks: weekRanges(ctx.today),
    sessions: ctx.sessions.map((s) => `${s.ref}  ${weekday(s.date)} ${s.date}  ${s.name}`).join("\n"),
    recent_turns: recentTurns(history),
    message: noLongDashes(message),
  }
}

/** Known refs in program order, "all", [] for none, or null when the answer is not usable. */
export function parseScope(raw: string, refs: string[]): string[] | "all" | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  for (const candidate of [raw.trim(), fence?.[1]?.trim(), raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)]) {
    if (!candidate) continue
    let j: any
    try {
      j = JSON.parse(candidate)
    } catch {
      continue
    }
    if (j?.refs === "all") return "all"
    if (!Array.isArray(j?.refs)) return null
    const picked = new Set(j.refs.filter((r: unknown) => typeof r === "string"))
    return refs.filter((r) => picked.has(r))
  }
  return null
}

/** Only the picked sessions stay editable; the rest are listed by date and name. All or none leaves it as it was. */
export function narrowContext(ctx: Context, picked: string[] | "all"): Context {
  if (picked === "all" || picked.length === 0 || picked.length === ctx.sessions.length) return ctx
  const keep = new Set(picked)
  return {
    ...ctx,
    sessions: ctx.sessions.filter((s) => keep.has(s.ref)),
    others: ctx.sessions.filter((s) => !keep.has(s.ref)).map((s) => ({ date: s.date, name: s.name })),
  }
}

/** One cheap call. Throws on any failure; the caller fails open. */
export async function scope(
  ctx: Context,
  message: string,
  history: Turn[],
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<{ refs: string[] | "all"; costUsd: number }> {
  const res = await (opts.fetchImpl ?? fetch)("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: SCOPE_MODEL(),
      max_tokens: 300,
      // Same as restate.ts: Haiku reasons by default and would spend the budget thinking.
      reasoning: { enabled: false },
      usage: { include: true },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(scopeState(ctx, message, history)) },
      ],
    }),
    // It usually answers in about a second; it holds up the edit, so give up early and edit the whole program instead.
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) throw new Error(`Scope returned ${res.status}`)
  const j = await res.json()
  const refs = parseScope(j.choices?.[0]?.message?.content ?? "", ctx.sessions.map((s) => s.ref))
  if (!refs) throw new Error("Scope answer was not usable")
  return { refs, costUsd: typeof j.usage?.cost === "number" ? j.usage.cost : 0 }
}
