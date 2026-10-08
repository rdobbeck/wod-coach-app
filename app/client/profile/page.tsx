import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { bookingFor } from "@/lib/booking"
import AccountSettings from "@/components/AccountSettings"
import PushToggle from "@/components/PushToggle"
import AppearanceSetting from "@/components/client/AppearanceSetting"
import FastingSettings from "@/components/client/FastingSettings"
import SignOutButton from "@/components/client/SignOutButton"
import { ReplayTourButton } from "@/components/client/Tour"
import { requireClient } from "@/lib/require-client"

export default async function ClientProfilePage() {
  const session = await requireClient()
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      clientProfile: true,
      coaches: {
        where: { status: "ACTIVE" },
        include: { coach: { select: { name: true, email: true, coachProfile: { select: { bookingUrl: true } } } } },
      },
    },
  })
  const p = user?.clientProfile
  const canBook = user?.coaches.some((c) => !!bookingFor(c.coach.coachProfile?.bookingUrl)) ?? false
  const rows: [string, string | null | undefined][] = [
    ["Coach", user?.coaches.map((c) => c.coach.name ?? c.coach.email).join(", ") || null],
    ["Goals", p?.goals.length ? p.goals.join(", ") : null],
    ["Injuries / notes", p?.injuries],
  ]

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-bold">Settings</h1>

      <dl className="divide-y divide-app-border rounded-2xl border border-app-border bg-app-surface">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-app-muted">{k}</dt>
            <dd className="text-right text-sm font-medium">{v || "-"}</dd>
          </div>
        ))}
      </dl>

      <PushToggle />

      <AccountSettings name={user?.name ?? ""} email={user?.email ?? ""} username={user?.username ?? ""} hasPassword={!!user?.hashedPassword} tone="client" />

      <AppearanceSetting current={p?.theme ?? "dark"} units={p?.units ?? "lb"} />

      {(p?.fastingOffered || p?.fastingEnabled) && (
        <FastingSettings
          enabled={p.fastingEnabled}
          protocol={p.fastingProtocol}
          windowStart={p.eatingWindowStart}
          windowEnd={p.eatingWindowEnd}
        />
      )}

      <ReplayTourButton canBook={canBook} canMove={p?.canMoveWorkouts ?? true} canAskAi={!!p?.canAskAi && !!user?.coaches.length} />

      <Link
        href="/client/report?from=/client/profile"
        className="block w-full rounded-xl border border-app-border px-4 py-3 text-center text-sm font-semibold text-app-text"
        data-testid="report-problem"
      >
        Report a problem
      </Link>

      <p className="text-xs text-app-muted">Need something changed? Message your coach.</p>
      <SignOutButton />
    </div>
  )
}
