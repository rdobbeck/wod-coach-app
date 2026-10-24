import { noLongDashes } from "@/lib/text"
import type { preState } from "@/lib/ai/check"

export const RESTATE_MODEL = () => process.env.AI_RESTATE_MODEL || "anthropic/claude-haiku-5.5"

const MAX_TEXT = 600

const SYSTEM = `You restate a message from a training app's assistant chat as ONE concrete instruction a programmer could carry out.
Use only what the person said. Resolve "today", "tomorrow" and weekday names to dates using today's date and the sessions list. Never invent exercises, numbers or days they did not give.
If you truly cannot tell what they want, return one short question instead.
Write in the person's own voice: first person if the viewer is the client, about "the client" if the viewer is the coach.
Reply only with JSON: {"kind":"restate"|"question","text":"..."}. Do not use dashes of any kind as punctuation.`

/** Tolerant parse: plain JSON, a fenced block, or the first {...} span. Null when it is not a usable answer. */
export function parseRestate(raw: string): { kind: "restate" | "question"; text: string } | null {
  let j: any = null
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  for (const candidate of [raw.trim(), fence?.[1]?.trim(), raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)]) {
    if (!candidate) continue
    try {
      j = JSON.parse(candidate)
      break
    } catch {}
  }
  if (!j || (j.kind !== "restate" && j.kind !== "question") || typeof j.text !== "string") return null
  const text = noLongDashes(j.text.trim()).slice(0, MAX_TEXT)
  return text ? { kind: j.kind, text } : null
}

/** One cheap call that says back what the person seems to want. Throws on any failure; callers fail open. */
export async function restate(
  state: ReturnType<typeof preState>,
  viewer: "coach" | "client",
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<{ kind: "restate" | "question"; text: string; costUsd: number }> {
  const doFetch = opts.fetchImpl ?? fetch
  const res = await doFetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: RESTATE_MODEL(),
      // Haiku reasons by default on OpenRouter and spends the whole budget thinking, leaving no answer.
      max_tokens: 400,
      reasoning: { enabled: false },
      usage: { include: true },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify({ viewer, ...state }) },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Restate returned ${res.status}`)
  const j = await res.json()
  const parsed = parseRestate(j.choices?.[0]?.message?.content ?? "")
  if (!parsed) throw new Error("Restate answer was not usable")
  return { ...parsed, costUsd: typeof j.usage?.cost === "number" ? j.usage.cost : 0 }
}
