import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getVBTSubscriptionStatus } from "@/lib/vbt-access"
import VBTUnlockButton from "@/components/vbt/VBTUnlockButton"

export default async function VBTPage() {
  const session = await getServerSession(authOptions)
  
  if (!session || session.user.role !== "CLIENT") {
    redirect("/")
  }

  const vbtStatus = await getVBTSubscriptionStatus(session.user.id)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">VBT Tracking</h1>
          <p className="mt-2 text-gray-600">
            Velocity Based Training - Optimize every rep with data-driven insights
          </p>
        </div>

        <VBTUnlockButton
          hasAccess={vbtStatus.hasAccess}
          status={vbtStatus.status}
          daysRemaining={vbtStatus.daysRemaining}
          isTrial={vbtStatus.isTrial}
        />

        {vbtStatus.hasAccess && (
          <div className="mt-8 space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                How to Use VBT Tracking
              </h2>
              <ol className="space-y-3 text-gray-600">
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-sm font-semibold mr-3">
                    1
                  </span>
                  <span>Go to your workout and tap the VBT icon on any exercise</span>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-sm font-semibold mr-3">
                    2
                  </span>
                  <span>Position your phone to capture the barbell side view</span>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-sm font-semibold mr-3">
                    3
                  </span>
                  <span>Get real-time velocity feedback as you lift</span>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-sm font-semibold mr-3">
                    4
                  </span>
                  <span>View your velocity trends and optimize your training</span>
                </li>
              </ol>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                VBT Metrics Explained
              </h2>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-900">Average Velocity (m/s)</h3>
                  <p className="text-sm text-gray-600">
                    The average speed of the barbell during the concentric (lifting) phase. 
                    Higher velocity typically indicates lower relative intensity.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Peak Velocity (m/s)</h3>
                  <p className="text-sm text-gray-600">
                    The maximum speed reached during the lift. Useful for power development.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Power Output (watts)</h3>
                  <p className="text-sm text-gray-600">
                    Force × velocity. Higher power output indicates explosive strength.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Velocity Loss (%)</h3>
                  <p className="text-sm text-gray-600">
                    Drop in velocity across a set. Used to monitor fatigue and stop sets at optimal points.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
