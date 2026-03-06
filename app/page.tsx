import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import Link from "next/link"

export default async function Home() {
  const session = await getServerSession(authOptions)

  if (session) {
    const dashboardUrl = session.user.role === "COACH" ? "/coach" : "/client"

    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-24">
        <div className="z-10 max-w-5xl w-full items-center justify-center">
          <h1 className="text-4xl font-bold text-center mb-4">
            Welcome back, {session.user.name}!
          </h1>
          <p className="text-center text-lg mb-8 text-gray-600">
            You're logged in as a {session.user.role.toLowerCase()}
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href={dashboardUrl}
              className="bg-primary-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-primary-700 transition"
            >
              Go to Dashboard →
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 md:p-24">
      <div className="z-10 max-w-5xl w-full">
        <div className="text-center mb-6">
          <div className="text-6xl md:text-7xl font-black tracking-tight text-gray-900 mb-2">
            WOD
          </div>
          <div className="text-sm md:text-base font-medium text-gray-500 uppercase tracking-wider">
            Workout Optimization Dashboard
          </div>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-center mb-4 text-gray-900">
          Optimize every rep. Elevate every client.
        </h1>
        <p className="text-center text-lg md:text-xl mb-12 text-gray-600">
          The complete coaching platform with VBT tracking, client management, and periodized program design.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <Link
            href="/auth/signup"
            className="bg-primary-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-primary-700 transition text-center"
          >
            Get Started
          </Link>
          <Link
            href="/auth/signin"
            className="bg-white border-2 border-primary-600 text-primary-600 px-8 py-3 rounded-lg text-lg font-semibold hover:bg-primary-50 transition text-center"
          >
            Sign In
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <div className="bg-white rounded-lg border-2 border-gray-200 p-6 hover:border-primary-300 transition">
            <h2 className="mb-3 text-2xl font-semibold text-gray-900">
              📊 Optimize Performance
            </h2>
            <ul className="space-y-2 text-gray-600">
              <li>✓ Real-time VBT (Velocity Based Training)</li>
              <li>✓ Bar velocity analysis & tracking</li>
              <li>✓ Data-driven load recommendations</li>
              <li>✓ Force-velocity profiling</li>
              <li>✓ Fatigue monitoring</li>
            </ul>
          </div>

          <div className="bg-white rounded-lg border-2 border-gray-200 p-6 hover:border-primary-300 transition">
            <h2 className="mb-3 text-2xl font-semibold text-gray-900">
              💬 Strengthen Relationships
            </h2>
            <ul className="space-y-2 text-gray-600">
              <li>✓ Built-in coach-client messaging</li>
              <li>✓ Seamless program sharing</li>
              <li>✓ Real-time workout feedback</li>
              <li>✓ Progress tracking & analytics</li>
              <li>✓ Client management dashboard</li>
            </ul>
          </div>

          <div className="bg-white rounded-lg border-2 border-gray-200 p-6 hover:border-primary-300 transition">
            <h2 className="mb-3 text-2xl font-semibold text-gray-900">
              📈 Design Better Programs
            </h2>
            <ul className="space-y-2 text-gray-600">
              <li>✓ Macro/meso/micro periodization</li>
              <li>✓ AI-powered program suggestions</li>
              <li>✓ Exercise library with videos</li>
              <li>✓ Auto-progression algorithms</li>
              <li>✓ Template & clone functionality</li>
            </ul>
          </div>

          <div className="bg-white rounded-lg border-2 border-gray-200 p-6 hover:border-primary-300 transition">
            <h2 className="mb-3 text-2xl font-semibold text-gray-900">
              🚀 Grow Your Business
            </h2>
            <ul className="space-y-2 text-gray-600">
              <li>✓ Manage unlimited clients</li>
              <li>✓ Wearables integration (WHOOP, Oura, etc)</li>
              <li>✓ Comprehensive analytics</li>
              <li>✓ Habit & lifestyle coaching</li>
              <li>✓ Premium VBT add-on revenue</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
