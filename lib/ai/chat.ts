import { ASSIST_MODEL, type ModelResult } from "@/lib/ai/assist"

// $ per million tokens, used only when OpenRouter does not report a cost.
const PRICE: Record<string, [number, number]> = { "anthropic/claude-sonnet-5": [2, 10] }
const FALLBACK_PRICE: [number, number] = [10, 50]

/**
 * One system + user turn through OpenRouter on our key, for tools that want a
 * JSON answer (the caller parses it). Same model, pricing and timeout as Ask AI.
 */
export async function completeJson(opts: { system: string; user: string; maxTokens: number }): Promise<ModelResult> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error("The AI assistant is not configured (no OpenRouter key).")
  const model = ASSIST_MODEL()
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens,
      usage: { include: true },
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
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
