'use client'

import { useEffect } from "react"

/** Friendly crash screen; reports to Ryan's phone once per mount. */
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    fetch("/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: error.message, digest: error.digest, path: location.pathname }),
    }).catch(() => {})
  }, [error])

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-lg font-bold text-gray-900">Something went wrong</p>
      <p className="text-sm text-gray-600">Your coach has been notified. Try again. Anything you logged is saved.</p>
      <button onClick={reset} className="w-full rounded-xl bg-primary-600 py-3 font-semibold text-white">Try again</button>
      <a href="/client" className="text-sm font-semibold text-primary-600">Back to Today</a>
    </div>
  )
}
