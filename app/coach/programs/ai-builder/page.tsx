import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import DashboardHeader from "@/components/DashboardHeader"
import AIProgramWizard from "@/components/ai/AIProgramWizard"

export default async function AIBuilderPage() {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== "COACH") {
    redirect("/")
  }

  const coach = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
  })

  if (!coach) {
    redirect("/coach")
  }

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
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">🤖 AI Program Builder</h1>
          <p className="mt-2 text-gray-600">
            Answer a few questions and let AI create a complete periodized program for your client
          </p>
        </div>

        <AIProgramWizard coach={coach} clients={clients} />
      </div>
    </div>
  )
}
