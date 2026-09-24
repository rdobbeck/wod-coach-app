import { prisma } from "@/lib/prisma"
import AuthShell from "@/components/auth/AuthShell"
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

  if (!user) {
    return (
      <AuthShell title="This link has expired" subtitle="Invite links work once and last 7 days. Ask your coach to send you a new one." />
    )
  }

  const coach = user.coaches[0]?.coach
  const first = user.name?.split(" ")[0]
  return (
    <AuthShell
      kicker={coach?.coachProfile?.brandName ?? undefined}
      title={first ? `Welcome, ${first}` : "Welcome"}
      subtitle={`${coach?.name ?? "Your coach"} invited you. Set a password and your training's ready.`}
    >
      <InviteForm token={params.token} email={user.email ?? ""} />
    </AuthShell>
  )
}
