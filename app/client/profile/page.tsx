import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import AppearanceSetting from "@/components/client/AppearanceSetting"
import SignOutButton from "@/components/client/SignOutButton"

export default async function ClientProfilePage() {
  const session = (await getServerSession(authOptions))!
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      clientProfile: true,
      coaches: { where: { status: "ACTIVE" }, include: { coach: { select: { name: true, email: true } } } },
    },
  })
  const p = user?.clientProfile
  const rows: [string, string | null | undefined][] = [
    ["Name", user?.name],
    ["Email", user?.email],
    ["Coach", user?.coaches.map((c) => c.coach.name ?? c.coach.email).join(", ") || null],
    ["Goals", p?.goals.length ? p.goals.join(", ") : null],
    ["Injuries / notes", p?.injuries],
  ]

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-bold">Profile</h1>

      <dl className="divide-y divide-app-border rounded-2xl border border-app-border bg-app-surface">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-app-muted">{k}</dt>
            <dd className="text-right text-sm font-medium">{v || "—"}</dd>
          </div>
        ))}
      </dl>

      <AppearanceSetting current={p?.theme ?? "dark"} units={p?.units ?? "lb"} />

      <p className="text-xs text-app-muted">Need something changed? Message your coach.</p>
      <SignOutButton />
    </div>
  )
}
