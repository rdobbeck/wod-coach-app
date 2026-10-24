export const CHECK_MODEL = () => process.env.AI_CHECK_MODEL || "typesafe/jev-1.13"

const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions"

export type Question =
  | { type: "noul"; instructions: string }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
export type JevAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number> }

/**
 * One call to Jev, TypeSafe's decision model on OpenRouter. It does not write
 * text: each question comes back as a probability (noul, 0..1) or a pick among
 * named criteria. Throws on anything unexpected; callers fail open.
 */
export async function askJev<K extends string>(
  state: unknown,
  questions: Record<K, Question>,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ answers: Record<K, JevAnswer>; costUsd: number }> {
  const timeoutMs = opts.timeoutMs ?? 3000
  const custom = !!opts.fetchImpl
  const doFetch = opts.fetchImpl ?? fetch
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    body: JSON.stringify({ model: CHECK_MODEL(), state, questions }),
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  let res: Response
  try {
    if (!custom) {
      res = await doFetch(DECISIONS_URL, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    } else {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Jev timed out after ${timeoutMs}ms`)), timeoutMs)
      })
      res = await Promise.race([doFetch(DECISIONS_URL, init), timeout])
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
  if (!res.ok) throw new Error(`Jev returned ${res.status}`)
  const json = (await res.json()) as { answers?: Record<string, any>; usage?: { cost?: number } }

  const answers = {} as Record<K, JevAnswer>
  for (const key of Object.keys(questions) as K[]) {
    const q = questions[key]
    const a = json.answers?.[key]
    if (!a) throw new Error(`Jev answer missing: ${key}`)
    if (q.type === "noul") {
      if (a.type !== "noul" || typeof a.noul !== "number" || !(a.noul >= 0 && a.noul <= 1)) throw new Error(`Jev noul invalid: ${key}`)
      answers[key] = { type: "noul", noul: a.noul }
    } else {
      if (a.type !== "choice" || typeof a.choice !== "string" || !(a.choice in q.criteria)) throw new Error(`Jev choice invalid: ${key}`)
      answers[key] = { type: "choice", choice: a.choice, probabilities: a.probabilities ?? {} }
    }
  }
  return { answers, costUsd: json.usage?.cost ?? 0 }
}
