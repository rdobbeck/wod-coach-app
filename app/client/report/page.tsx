import { Suspense } from "react"
import Link from "next/link"
import { requireClient } from "@/lib/require-client"
import BugReportForm from "@/components/client/BugReportForm"

/** Report a problem: the one place a client goes when something in the app looks wrong. */
export default async function ReportProblemPage() {
  await requireClient()
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/client/profile" className="text-sm font-semibold text-app-accent">
          ← Settings
        </Link>
        <h1 className="font-display text-4xl font-bold">Report a problem</h1>
        <p className="text-sm text-app-muted">Something broken, confusing or just off? Tell Ryan here. A screenshot helps a lot.</p>
      </div>
      <Suspense fallback={null}>
        <BugReportForm />
      </Suspense>
    </div>
  )
}
