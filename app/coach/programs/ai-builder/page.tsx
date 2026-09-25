import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import DashboardHeader from "@/components/DashboardHeader"
import AIProgramWizard from "@/components/ai/AIProgramWizard"
import { PROGRAM_ESTIMATE_CENTS, programFundingSummary } from "@/lib/ai-billing"

export default async function AIBuilderPage() {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== "COACH") {
    redirect("/")
  }

  // Only what the wizard needs: this object is sent to the browser.
  const coach = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  if (!coach) {
    redirect("/coach")
  }

  const funding = await programFundingSummary(session.user.id)

  // Get coach's clients for selection
  const clients = await prisma.clientCoach.findMany({
    where: {
      coachId: session.user.id,
      status: "ACTIVE",
    },
    include: {
      client: {
        include: {
          clientProfile: true,
        },
      },
    },
  })

  return (
    <div className="min-h-screen bg-[#f4f2ed]">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="font-display text-4xl font-bold text-[#16181d]">Build a program</h1>
          <p className="mt-1 text-sm text-[#6b6257]">
            Answer a few questions and AI drafts a periodized block. You review and edit it before your client sees anything.
          </p>
        </div>

        <AIProgramWizard clients={clients} funding={funding} estimate={PROGRAM_ESTIMATE_CENTS} />
      </div>
    </div>
  )
}
