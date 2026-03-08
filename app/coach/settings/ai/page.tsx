import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import AISettingsForm from "@/components/ai/AISettingsForm"
import CreditPurchaseButtons from "@/components/ai/CreditPurchaseButtons"
import PurchaseSuccessHandler from "@/components/ai/PurchaseSuccessHandler"
import DashboardHeader from "@/components/DashboardHeader"
import ProviderSwitchButtons from "@/components/ai/ProviderSwitchButtons"

export default async function AISettingsPage() {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== "COACH") {
    redirect("/")
  }

  const coach = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      creditPurchases: {
        orderBy: { purchasedAt: "desc" },
        take: 5,
      },
    },
  })

  if (!coach) {
    redirect("/coach")
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />
      <PurchaseSuccessHandler />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">AI Program Builder Settings</h1>
          <p className="mt-2 text-gray-600">
            Configure how you want to use AI to generate training programs
          </p>
        </div>

        {/* Current Status */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Current Plan</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border-2 border-gray-200 rounded-lg p-4">
              <div className="text-sm text-gray-500">AI Provider</div>
              <div className="text-lg font-semibold mt-1">
                {coach.aiProvider === "GEMINI_FREE" && "Free Tier"}
                {coach.aiProvider === "VENICE_FREE" && "Venice API"}
                {coach.aiProvider === "PAY_PER_PROGRAM" && "Pay-Per-Program"}
                {coach.aiProvider === "BRING_YOUR_OWN_KEY" && "Your API Key"}
              </div>
            </div>

            <div className="border-2 border-gray-200 rounded-lg p-4">
              <div className="text-sm text-gray-500">Credits Remaining</div>
              <div className="text-lg font-semibold mt-1">
                {coach.aiProvider === "PAY_PER_PROGRAM" ? coach.aiCredits : "—"}
              </div>
            </div>

            <div className="border-2 border-gray-200 rounded-lg p-4">
              <div className="text-sm text-gray-500">Programs Generated</div>
              <div className="text-lg font-semibold mt-1">
                {coach.totalProgramsGenerated}
                {coach.aiProvider === "GEMINI_FREE" && " / 5 this month"}
              </div>
            </div>
          </div>
        </div>

        {/* AI Provider Options */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-6">Choose Your AI Plan</h2>
          <ProviderSwitchButtons currentProvider={coach.aiProvider} />
        </div>

        {/* Settings Form */}
        <AISettingsForm coach={coach} />

        {/* Purchase Credits (if pay-per-program) */}
        {coach.aiProvider === "PAY_PER_PROGRAM" && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Purchase Credits</h2>
            <p className="text-gray-600 mb-6">
              Each credit = 1 AI-generated program. Credits never expire.
            </p>
            <CreditPurchaseButtons />
          </div>
        )}

        {/* Recent Purchases */}
        {coach.creditPurchases.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Recent Credit Purchases</h2>
            <table className="min-w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 text-sm font-medium text-gray-500">Date</th>
                  <th className="text-left py-2 text-sm font-medium text-gray-500">Credits</th>
                  <th className="text-left py-2 text-sm font-medium text-gray-500">Amount</th>
                </tr>
              </thead>
              <tbody>
                {coach.creditPurchases.map((purchase) => (
                  <tr key={purchase.id} className="border-b">
                    <td className="py-3 text-sm">{new Date(purchase.purchasedAt).toLocaleDateString()}</td>
                    <td className="py-3 text-sm">{purchase.creditsAmount}</td>
                    <td className="py-3 text-sm font-semibold">${purchase.totalAmount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
