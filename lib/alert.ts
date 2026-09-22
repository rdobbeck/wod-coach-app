/**
 * Push an alert to Ryan's phone (Push by Techulus). No-op without PUSH_API_KEY,
 * never throws: alerting must not turn a handled error into a second failure.
 */
export async function alertRyan(title: string, body: string) {
  const key = process.env.PUSH_API_KEY
  if (!key) return
  try {
    await fetch(`https://push.techulus.com/api/v1/notify/${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.slice(0, 120), body: body.slice(0, 900) }),
      signal: AbortSignal.timeout(4000),
    })
  } catch (e) {
    console.warn("[alert] push failed:", (e as Error).message)
  }
}

/** Standard alert for an unexpected server error in an API route. */
export function reportServerError(route: string, error: unknown, context?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[${route}]`, error)
  const ctx = context ? `\n${Object.entries(context).map(([k, v]) => `${k}: ${v}`).join("\n")}` : ""
  return alertRyan(`WOD Coach error: ${route}`, `${message}${ctx}`)
}

/** Wrap a route handler: unexpected throws -> push alert + JSON 500 instead of a bare crash. */
export function withAlert<A extends unknown[]>(route: string, handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args)
    } catch (error) {
      const req = args[0] instanceof Request ? args[0] : null
      await reportServerError(route, error, req ? { method: req.method, path: new URL(req.url).pathname } : undefined)
      return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 })
    }
  }
}
