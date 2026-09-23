import { prisma } from "@/lib/prisma"
import InviteForm from "./InviteForm"

export default async function InvitePage({ params }: { params: { token: string } }) {
  const invite = await prisma.verificationToken.findUnique({ where: { token: params.token } })
  const valid = invite && invite.identifier.startsWith("invite:") && invite.expires > new Date()
  const user = valid
    ? await prisma.user.findUnique({
        where: { id: invite!.identifier.slice("invite:".length) },
        select: { name: true, email: true, coaches: { include: { coach: { select: { name: true, coachProfile: { select: { brandName: true } } } } } } },
      })
    : null

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-sm">
        <h1 className="text-center text-3xl font-black text-gray-900">
          {user?.coaches[0]?.coach.coachProfile?.brandName ?? "WOD.COACH"}
        </h1>
        {!user ? (
          <p className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 text-center text-gray-700">
            This invite link has expired or was already used. Ask your coach for a new one.
          </p>
        ) : (
          <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-xl font-bold text-gray-900">Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}!</h2>
            <p className="mt-1 text-sm text-gray-600">
              {user.coaches[0]?.coach.name ?? "Your coach"} invited you. Set a password to see your training.
            </p>
            <InviteForm token={params.token} email={user.email ?? ""} />
          </div>
        )}
      </div>
    </div>
  )
}
