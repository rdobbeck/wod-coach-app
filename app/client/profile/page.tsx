import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
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
    ["Units", p?.units === "kg" ? "Kilograms" : "Pounds"],
    ["Goals", p?.goals.length ? p.goals.join(", ") : null],
    ["Injuries / notes", p?.injuries],
  ]

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
      <dl className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-gray-500">{k}</dt>
            <dd className="text-right text-sm font-medium text-gray-900">{v || "—"}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-gray-500">Need to change something? Message your coach.</p>
      <SignOutButton />
    </div>
  )
}
