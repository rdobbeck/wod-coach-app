import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import DashboardHeader from "@/components/DashboardHeader"
import AccountSettings from "@/components/AccountSettings"
import PushToggle from "@/components/PushToggle"
import CoachDefaults from "@/components/coach/CoachDefaults"
import SignOutButton from "@/components/client/SignOutButton"

export default async function CoachSettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") redirect("/")

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { coachProfile: true, clients: { where: { status: "ACTIVE" }, select: { id: true } } },
  })
  const coach = user?.coachProfile

  return (
    <div className="min-h-screen bg-[#f4f2ed]">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="font-display text-4xl font-bold text-[#16181d]">Settings</h1>
        <p className="mt-1 text-sm text-[#6b6257]">
          {user?.clients.length ?? 0} active {user?.clients.length === 1 ? "client" : "clients"}
        </p>

        <div className="mt-6 space-y-4">
          <PushToggle tone="coach" />

          <AccountSettings name={user?.name ?? ""} email={user?.email ?? ""} hasPassword={!!user?.hashedPassword} />

          <CoachDefaults
            units={coach?.defaultUnits ?? "lb"}
            restSeconds={coach?.defaultRestSeconds ?? 90}
            canMove={coach?.defaultCanMoveWorkouts ?? true}
            bookingUrl={coach?.bookingUrl ?? ""}
          />

          <div className="rounded-2xl border border-[#e4dfd5] bg-white p-4">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-[#857c70]">Program builder</p>
            <p className="mt-2 text-sm text-[#4a443c]">
              Model and API key for AI generated programs. Currently {coach?.aiProvider === "BRING_YOUR_OWN_KEY" ? "your own OpenRouter key" : "the app's key"}.
            </p>
            <Link href="/coach/settings/ai" className="mt-3 inline-block rounded-xl border border-[#ddd7cc] px-4 py-2 text-sm font-semibold text-[#16181d]">
              AI settings
            </Link>
          </div>

          <div className="rounded-2xl border border-[#e4dfd5] bg-white p-4">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-[#857c70]">Exercise library</p>
            <p className="mt-2 text-sm text-[#4a443c]">Synced nightly from CoachRx. You can also add exercises with a video link while editing a workout.</p>
            <Link href="/coach/library" className="mt-3 inline-block rounded-xl border border-[#ddd7cc] px-4 py-2 text-sm font-semibold text-[#16181d]">
              Open library
            </Link>
          </div>

          <SignOutButton />
        </div>
      </div>
    </div>
  )
}
