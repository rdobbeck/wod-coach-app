import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import AISettingsForm from "@/components/ai/AISettingsForm"
import CreditPurchaseButtons from "@/components/ai/CreditPurchaseButtons"
import PurchaseSuccessHandler from "@/components/ai/PurchaseSuccessHandler"
import DashboardHeader from "@/components/DashboardHeader"

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
                {coach.aiProvider === "GEMINI_FREE" && "Free (Gemini)"}
                {coach.aiProvider === "VENICE_FREE" && "Free (Venice)"}
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

          <div className="grid md:grid-cols-4 gap-6">
            {/* Free Plan - Gemini */}
            <div className={`border-2 rounded-lg p-6 ${coach.aiProvider === "GEMINI_FREE" ? "border-primary-600 bg-primary-50" : "border-gray-200"}`}>
              <h3 className="text-lg font-bold mb-2">Free (Gemini)</h3>
              <div className="text-3xl font-black mb-4">$0</div>
              <ul className="space-y-2 text-sm text-gray-600 mb-6">
                <li>✓ 5 programs/month</li>
                <li>✓ Google Gemini 2.0</li>
                <li>✓ Good quality</li>
                <li>✗ Monthly limit</li>
              </ul>
              {coach.aiProvider !== "GEMINI_FREE" && (
                <button className="w-full bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition">
                  Switch
                </button>
              )}
            </div>

            {/* Free Plan - Venice */}
            <div className={`border-2 rounded-lg p-6 ${coach.aiProvider === "VENICE_FREE" ? "border-primary-600 bg-primary-50" : "border-gray-200"}`}>
              <h3 className="text-lg font-bold mb-2">Free (Venice)</h3>
              <div className="text-3xl font-black mb-4">$0</div>
              <ul className="space-y-2 text-sm text-gray-600 mb-6">
                <li>✓ Unlimited programs</li>
                <li>✓ Llama 3.3 70B</li>
                <li>✓ Privacy-focused</li>
                <li>✓ No data retention</li>
              </ul>
              {coach.aiProvider !== "VENICE_FREE" && (
                <button className="w-full bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition">
                  Switch
                </button>
              )}
            </div>

            {/* Pay-Per-Program */}
            <div className={`border-2 rounded-lg p-6 ${coach.aiProvider === "PAY_PER_PROGRAM" ? "border-primary-600 bg-primary-50" : "border-gray-200"}`}>
              <div className="text-xs font-bold text-primary-600 uppercase mb-2">Most Popular</div>
              <h3 className="text-lg font-bold mb-2">Pay-Per-Program</h3>
              <div className="text-3xl font-black mb-4">$3<span className="text-lg text-gray-500">/program</span></div>
              <ul className="space-y-2 text-sm text-gray-600 mb-6">
                <li>✓ Unlimited programs</li>
                <li>✓ Claude Sonnet 4</li>
                <li>✓ Best quality results</li>
                <li>✓ Pay only what you use</li>
              </ul>
              {coach.aiProvider !== "PAY_PER_PROGRAM" && (
                <button className="w-full bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700 transition">
                  Switch to Pay-Per-Program
                </button>
              )}
            </div>

            {/* BYOK */}
            <div className={`border-2 rounded-lg p-6 ${coach.aiProvider === "BRING_YOUR_OWN_KEY" ? "border-primary-600 bg-primary-50" : "border-gray-200"}`}>
              <h3 className="text-lg font-bold mb-2">Your API Key</h3>
              <div className="text-3xl font-black mb-4">Custom</div>
              <ul className="space-y-2 text-sm text-gray-600 mb-6">
                <li>✓ Unlimited programs</li>
                <li>✓ Choose any model</li>
                <li>✓ Full control</li>
                <li>✓ No WOD markup</li>
              </ul>
              {coach.aiProvider !== "BRING_YOUR_OWN_KEY" && (
                <button className="w-full bg-gray-600 text-white py-2 rounded-lg hover:bg-gray-700 transition">
                  Use Your Key
                </button>
              )}
            </div>
          </div>
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
