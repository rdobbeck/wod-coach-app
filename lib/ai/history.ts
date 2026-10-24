import type { Turn } from "./assist"

type HistoryMsg = { role: "user" | "assistant"; text: string; failed?: boolean; changes?: unknown[]; state?: "pending" | "applied" | "discarded"; undone?: boolean }

/**
 * The conversation as the model reads it. A proposal's text alone ("Added a
 * swim session for today") read as done even after the coach discarded it,
 * so the next answer talked about a swim that was never added. Each proposal
 * now starts by saying what became of it.
 */
export function historyFor(msgs: HistoryMsg[]): Turn[] {
  return msgs
    .filter((m) => !m.failed)
    .map((m) => {
      if (m.role !== "assistant" || !m.changes?.length) return { role: m.role, content: m.text }
      const fate =
        m.state === "discarded"
          ? "Proposal discarded, nothing applied"
          : m.state === "applied"
            ? m.undone
              ? "Proposal applied, then undone"
              : "Proposal applied"
            : "Proposal waiting for review, not applied"
      // First, not last: the server and the checks cut long turns from the end.
      return { role: m.role, content: `[${fate}] ${m.text}` }
    })
}
