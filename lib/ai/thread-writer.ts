/**
 * Writes to the saved Ask AI thread go out one at a time, in the order they
 * were asked for. The panel saves after every turn and clears on request; if
 * those requests raced, a slow early save could land after a later one and a
 * reload would show a half-applied batch, or a cleared thread would come back.
 */
export type ThreadWriter = {
  save: (messages: unknown[]) => Promise<boolean>
  clear: () => Promise<boolean>
}

export function createThreadWriter(clientId: string, fetchImpl: typeof fetch = fetch): ThreadWriter {
  let chain: Promise<unknown> = Promise.resolve()
  const run = (go: () => Promise<Response | { ok: boolean }>) => {
    const next = chain.then(go).then((r) => r.ok, () => false)
    chain = next
    return next
  }
  return {
    save: (messages) =>
      run(() =>
        fetchImpl("/api/ai/assist/thread", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, messages }),
        }),
      ),
    clear: () => run(() => fetchImpl(`/api/ai/assist/thread?clientId=${encodeURIComponent(clientId)}`, { method: "DELETE" })),
  }
}
