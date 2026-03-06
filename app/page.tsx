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
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 text-center">
        <div className="mb-8">
          <div className="text-7xl md:text-8xl font-black tracking-tight text-gray-900 mb-3">
            WOD
          </div>
          <div className="text-base md:text-lg font-semibold text-gray-500 uppercase tracking-wider mb-6">
            Workout Optimization Dashboard
          </div>
        </div>

        <h1 className="text-4xl md:text-6xl font-bold mb-6 text-gray-900 leading-tight">
          The Data-Driven<br />
          <span className="text-primary-600">Coaching Platform</span><br/>
          For Elite Results
        </h1>

        <p className="text-xl md:text-2xl text-gray-600 mb-4 max-w-3xl mx-auto">
          Transform your coaching with VBT tracking, AI-powered program design, and tools that help you retain clients and grow revenue.
        </p>

        <p className="text-base md:text-lg text-gray-500 mb-12 max-w-2xl mx-auto">
          Built for strength coaches, personal trainers, and performance specialists who demand more than generic training apps.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
          <Link
            href="/auth/signup"
            className="bg-primary-600 text-white px-10 py-4 rounded-lg text-lg font-bold hover:bg-primary-700 transition text-center shadow-lg hover:shadow-xl"
          >
            Start Free Trial →
          </Link>
          <Link
            href="/auth/signin"
            className="bg-white border-2 border-gray-300 text-gray-900 px-10 py-4 rounded-lg text-lg font-semibold hover:border-primary-600 transition text-center"
          >
            Sign In
          </Link>
        </div>

        <p className="text-sm text-gray-500">
          Free for up to 5 clients • No credit card required • VBT add-on available
        </p>
      </div>

      {/* Problem/Solution Section */}
      <div className="bg-gray-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h3 className="text-2xl font-bold mb-6 text-red-400">The Problem</h3>
              <ul className="space-y-4 text-gray-300">
                <li className="flex items-start">
                  <span className="text-red-400 mr-3">✗</span>
                  <span>Spreadsheets are time-consuming and clients can't access them easily</span>
                </li>
                <li className="flex items-start">
                  <span className="text-red-400 mr-3">✗</span>
                  <span>Generic fitness apps don't support periodization or VBT</span>
                </li>
                <li className="flex items-start">
                  <span className="text-red-400 mr-3">✗</span>
                  <span>Clients ghost you because there's no accountability system</span>
                </li>
                <li className="flex items-start">
                  <span className="text-red-400 mr-3">✗</span>
                  <span>You're leaving money on the table with no premium features to upsell</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-2xl font-bold mb-6 text-green-400">The Solution</h3>
              <ul className="space-y-4 text-gray-300">
                <li className="flex items-start">
                  <span className="text-green-400 mr-3">✓</span>
                  <span>Build programs once, share instantly with unlimited clients</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-400 mr-3">✓</span>
                  <span>True periodization (macro/meso/micro) + VBT tracking built-in</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-400 mr-3">✓</span>
                  <span>Real-time messaging, workout logging, and progress tracking</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-400 mr-3">✓</span>
                  <span>Offer VBT as a premium add-on ($4.99/week per client = recurring revenue)</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* VBT Monetization Callout */}
      <div className="bg-primary-600 text-white py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h3 className="text-3xl md:text-4xl font-bold mb-4">
            Turn VBT Into Recurring Revenue
          </h3>
          <p className="text-xl mb-6 text-primary-100">
            Your clients pay $4.99/week for velocity-based training features. You coach, we handle the tech.
          </p>
          <p className="text-lg text-primary-100">
            <strong>50 clients with VBT</strong> = <strong className="text-white text-2xl">$249.50/week</strong> = <strong className="text-white text-3xl">$12,974/year</strong> extra revenue
          </p>
        </div>
      </div>

      {/* Features Grid */}
      <div className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-4 text-gray-900">
            Everything You Need to Scale Your Coaching
          </h2>
          <p className="text-xl text-gray-600 text-center mb-16 max-w-3xl mx-auto">
            From program design to client communication, WOD gives you the tools to deliver world-class coaching at scale.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
            <div className="bg-white rounded-xl border-2 border-gray-200 p-8 hover:border-primary-500 hover:shadow-xl transition">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                VBT Tracking & Analytics
              </h3>
              <ul className="space-y-3 text-gray-600 leading-relaxed">
                <li>✓ Real-time bar velocity measurement</li>
                <li>✓ Autoregulated load recommendations</li>
                <li>✓ Force-velocity profiling</li>
                <li>✓ Fatigue monitoring & readiness scores</li>
                <li>✓ Client pays $4.99/week (you earn the difference)</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl border-2 border-gray-200 p-8 hover:border-primary-500 hover:shadow-xl transition">
              <div className="text-4xl mb-4">📈</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                Periodization Program Builder
              </h3>
              <ul className="space-y-3 text-gray-600 leading-relaxed">
                <li>✓ Macro/meso/microcycle planning</li>
                <li>✓ AI-powered program suggestions</li>
                <li>✓ Template library & cloning</li>
                <li>✓ Auto-progression algorithms</li>
                <li>✓ Exercise library with video demos</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl border-2 border-gray-200 p-8 hover:border-primary-500 hover:shadow-xl transition">
              <div className="text-4xl mb-4">💬</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                Client Communication & Retention
              </h3>
              <ul className="space-y-3 text-gray-600 leading-relaxed">
                <li>✓ Built-in messaging system</li>
                <li>✓ Workout check-ins & accountability</li>
                <li>✓ Progress photos & measurements</li>
                <li>✓ Real-time feedback on form & technique</li>
                <li>✓ Automated reminders & notifications</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl border-2 border-gray-200 p-8 hover:border-primary-500 hover:shadow-xl transition">
              <div className="text-4xl mb-4">🚀</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                Business Growth Tools
              </h3>
              <ul className="space-y-3 text-gray-600 leading-relaxed">
                <li>✓ Unlimited client management</li>
                <li>✓ Wearables integration (WHOOP, Oura, Garmin)</li>
                <li>✓ Nutrition & lifestyle coaching</li>
                <li>✓ Comprehensive analytics dashboard</li>
                <li>✓ White-label ready (coming soon)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Tiers */}
      <div className="bg-gray-50 py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-4 text-gray-900">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-gray-600 text-center mb-16">
            Start free, scale as you grow. No surprises.
          </p>

          <div className="grid md:grid-cols-4 gap-6 max-w-6xl mx-auto">
            <div className="bg-white rounded-xl p-8 border-2 border-gray-200">
              <h3 className="text-2xl font-bold mb-2">Free</h3>
              <div className="text-4xl font-black mb-4">$0<span className="text-lg text-gray-500">/mo</span></div>
              <p className="text-gray-600 mb-6">Perfect for getting started</p>
              <ul className="space-y-3 text-sm text-gray-600 mb-8">
                <li>✓ 1-5 clients</li>
                <li>✓ Unlimited programs</li>
                <li>✓ Basic analytics</li>
                <li>✓ Messaging</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl p-8 border-2 border-primary-600 shadow-lg transform scale-105">
              <div className="text-xs font-bold text-primary-600 uppercase mb-2">Most Popular</div>
              <h3 className="text-2xl font-bold mb-2">Starter</h3>
              <div className="text-4xl font-black mb-4">$29<span className="text-lg text-gray-500">/mo</span></div>
              <p className="text-gray-600 mb-6">For growing coaches</p>
              <ul className="space-y-3 text-sm text-gray-600 mb-8">
                <li>✓ 6-50 clients</li>
                <li>✓ Everything in Free</li>
                <li>✓ Advanced analytics</li>
                <li>✓ Wearables integration</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl p-8 border-2 border-gray-200">
              <h3 className="text-2xl font-bold mb-2">Pro</h3>
              <div className="text-4xl font-black mb-4">$99<span className="text-lg text-gray-500">/mo</span></div>
              <p className="text-gray-600 mb-6">For established coaches</p>
              <ul className="space-y-3 text-sm text-gray-600 mb-8">
                <li>✓ 51-150 clients</li>
                <li>✓ Everything in Starter</li>
                <li>✓ Priority support</li>
                <li>✓ Custom branding</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl p-8 border-2 border-gray-200">
              <h3 className="text-2xl font-bold mb-2">Enterprise</h3>
              <div className="text-4xl font-black mb-4">Custom</div>
              <p className="text-gray-600 mb-6">For training facilities</p>
              <ul className="space-y-3 text-sm text-gray-600 mb-8">
                <li>✓ Unlimited clients</li>
                <li>✓ Multiple coaches</li>
                <li>✓ White-label option</li>
                <li>✓ Dedicated support</li>
              </ul>
            </div>
          </div>

          <p className="text-center text-gray-600 mt-8">
            <strong>VBT Add-On:</strong> $4.99/week per client (you set your markup)
          </p>
        </div>
      </div>

      {/* Final CTA */}
      <div className="bg-gray-900 text-white py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Ready to Level Up Your Coaching?
          </h2>
          <p className="text-xl text-gray-300 mb-10">
            Join coaches who are delivering data-driven results and building sustainable businesses.
          </p>
          <Link
            href="/auth/signup"
            className="inline-block bg-primary-600 text-white px-12 py-5 rounded-lg text-xl font-bold hover:bg-primary-700 transition shadow-xl hover:shadow-2xl"
          >
            Start Your Free Trial →
          </Link>
          <p className="text-sm text-gray-400 mt-6">
            No credit card required • Cancel anytime • Full access to all features
          </p>
        </div>
      </div>
    </main>
  );
}
