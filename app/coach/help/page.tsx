import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import DashboardHeader from "@/components/DashboardHeader"
import Link from "next/link"

export default async function HelpPage() {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== "COACH") {
    redirect("/")
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">📚 Help & Documentation</h1>
          <p className="mt-2 text-gray-600">
            Everything you need to master WOD Coach and build better programs
          </p>
        </div>

        {/* Quick Start Guide */}
        <div className="bg-white rounded-lg shadow p-8 mb-6">
          <h2 className="text-2xl font-bold mb-4">🚀 Quick Start Guide</h2>
          <div className="space-y-4">
            <div className="flex items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold mr-4">
                1
              </div>
              <div>
                <h3 className="font-semibold mb-1">Add Your First Client</h3>
                <p className="text-gray-600 mb-2">
                  Go to Dashboard → "Add Client" and enter their information. You can add goals, equipment, and injuries to their profile.
                </p>
                <Link href="/coach/clients/new" className="text-primary-600 hover:underline text-sm">
                  Add Client Now →
                </Link>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold mr-4">
                2
              </div>
              <div>
                <h3 className="font-semibold mb-1">Choose Your AI Plan</h3>
                <p className="text-gray-600 mb-2">
                  Configure how you want to generate programs: Free (Gemini), Pay-Per-Program (Claude), or bring your own OpenRouter API key.
                </p>
                <Link href="/coach/settings/ai" className="text-primary-600 hover:underline text-sm">
                  Configure AI Settings →
                </Link>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold mr-4">
                3
              </div>
              <div>
                <h3 className="font-semibold mb-1">Generate Your First Program</h3>
                <p className="text-gray-600 mb-2">
                  Use the AI Program Builder to create a complete periodized program in 60 seconds. Just answer a few questions about your client.
                </p>
                <Link href="/coach/programs/ai-builder" className="text-primary-600 hover:underline text-sm">
                  Try AI Builder →
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* AI Program Builder Guide */}
        <div className="bg-white rounded-lg shadow p-8 mb-6">
          <h2 className="text-2xl font-bold mb-4">🤖 AI Program Builder Guide</h2>

          <h3 className="text-xl font-semibold mb-3">How It Works</h3>
          <p className="text-gray-600 mb-4">
            The AI Program Builder uses advanced language models to create scientifically-backed periodized programs. Here's what you need to know:
          </p>

          <div className="space-y-6">
            <div>
              <h4 className="font-semibold mb-2">Step 1: Select Client</h4>
              <p className="text-gray-600">
                Choose which client this program is for. If they have a profile with goals and equipment, that information will auto-fill.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Step 2: Training Goals</h4>
              <p className="text-gray-600 mb-2">
                Be specific about what your client wants to achieve. Examples:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-1">
                <li>"Increase squat 1RM by 50lbs in 12 weeks"</li>
                <li>"Build muscle mass in upper body, focus on chest and back"</li>
                <li>"Improve work capacity and conditioning for CrossFit"</li>
                <li>"Train for first powerlifting meet in 16 weeks"</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Step 3: Training Details</h4>
              <p className="text-gray-600">
                Specify training frequency (2-6 days/week), available equipment, experience level, and program length (4-16 weeks).
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Step 4: Review & Generate</h4>
              <p className="text-gray-600">
                Confirm all details. The AI will create a complete program with:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-1">
                <li>Mesocycles (training phases like Hypertrophy, Strength, Power)</li>
                <li>Microcycles (weekly progressions)</li>
                <li>Complete workouts with exercises, sets, reps, rest times</li>
                <li>Rationale explaining the programming decisions</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold mb-2 text-blue-900">💡 Pro Tips</h4>
            <ul className="space-y-2 text-sm text-blue-800">
              <li>• Be specific with goals - "increase bench press" is better than "get stronger"</li>
              <li>• Mention injuries or limitations - AI will program around them</li>
              <li>• Longer programs (12+ weeks) get proper periodization with deload weeks</li>
              <li>• You can always edit the generated program before saving</li>
            </ul>
          </div>
        </div>

        {/* AI Provider Options */}
        <div className="bg-white rounded-lg shadow p-8 mb-6">
          <h2 className="text-2xl font-bold mb-4">⚙️ AI Provider Options</h2>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">Free (Gemini 2.0 Flash)</h3>
              <p className="text-gray-600 mb-2">
                <strong>Best for:</strong> Trying out the AI builder, coaches with 1-5 clients
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-1">
                <li>5 programs per month</li>
                <li>Good quality results</li>
                <li>No cost</li>
                <li>Resets monthly</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Pay-Per-Program (Claude Sonnet 4)</h3>
              <p className="text-gray-600 mb-2">
                <strong>Best for:</strong> Most coaches, high-quality programs
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-1">
                <li>$3 per program (uses 1 credit)</li>
                <li>Highest quality AI (Claude Sonnet 4)</li>
                <li>Unlimited programs (buy credits as needed)</li>
                <li>Credits never expire</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Bring Your Own Key</h3>
              <p className="text-gray-600 mb-2">
                <strong>Best for:</strong> Tech-savvy coaches, high-volume users
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-1">
                <li>Use your own OpenRouter API key</li>
                <li>Choose any model (Claude, GPT-4, Gemini, Llama, etc.)</li>
                <li>No WOD markup - pay OpenRouter's rates directly</li>
                <li>Unlimited programs</li>
              </ul>
              <div className="mt-3 bg-gray-50 border border-gray-200 rounded p-3">
                <p className="text-sm text-gray-600">
                  <strong>How to set up:</strong> Get an API key from{" "}
                  <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                    openrouter.ai/keys
                  </a>
                  {" "}and add it in AI Settings.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="bg-white rounded-lg shadow p-8 mb-6">
          <h2 className="text-2xl font-bold mb-4">❓ Frequently Asked Questions</h2>

          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-1">How accurate are the AI-generated programs?</h3>
              <p className="text-gray-600">
                The AI uses the same principles as expert coaches: proper periodization, progressive overload, and exercise selection based on goals.
                The quality depends on the model (Claude Sonnet 4 produces the best results). Always review and adjust based on your coaching expertise.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-1">Can I edit programs after generating?</h3>
              <p className="text-gray-600">
                Yes! The AI gives you a starting point. You can edit exercises, sets, reps, add notes, or regenerate entirely.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-1">What if I run out of free programs?</h3>
              <p className="text-gray-600">
                You have 3 options: (1) Wait until next month (resets monthly), (2) Switch to pay-per-program ($3/program), or (3) Add your own OpenRouter API key for unlimited access.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-1">Which AI model should I use?</h3>
              <p className="text-gray-600">
                For highest quality: Claude Sonnet 4 (pay-per-program or BYOK). For free tier: Gemini 2.0 Flash is solid. If using your own key, Claude Sonnet 4 or GPT-4 Turbo are recommended.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-1">How long does generation take?</h3>
              <p className="text-gray-600">
                Typically 30-60 seconds. Longer programs (12+ weeks) may take up to 90 seconds.
              </p>
            </div>
          </div>
        </div>

        {/* Support */}
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-6 text-center">
          <h2 className="text-2xl font-bold mb-2">Need More Help?</h2>
          <p className="text-gray-700 mb-4">
            Have questions or feedback? We're here to help.
          </p>
          <div className="flex gap-4 justify-center">
            <a
              href="mailto:support@wod.coach"
              className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition"
            >
              Email Support
            </a>
            <Link
              href="/coach"
              className="bg-white border-2 border-primary-600 text-primary-600 px-6 py-2 rounded-lg hover:bg-primary-50 transition"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
