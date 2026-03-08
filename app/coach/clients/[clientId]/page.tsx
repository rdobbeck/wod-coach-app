import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import DashboardHeader from "@/components/DashboardHeader"

export default async function ClientDetailPage({
  params,
}: {
  params: { clientId: string }
}) {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== "COACH") {
    redirect("/")
  }

  // Get client relationship
  const clientCoach = await prisma.clientCoach.findFirst({
    where: {
      coachId: session.user.id,
      clientId: params.clientId,
    },
    include: {
      client: {
        include: {
          clientProfile: true,
        },
      },
    },
  })

  if (!clientCoach) {
    redirect("/coach/clients")
  }

  // Get client's programs
  const programs = await prisma.program.findMany({
    where: {
      clientId: params.clientId,
      coachId: session.user.id,
    },
    include: {
      mesocycles: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  const client = clientCoach.client

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <Link
          href="/coach/clients"
          className="text-primary-600 hover:text-primary-700 mb-6 inline-block"
        >
          ← Back to All Clients
        </Link>

        {/* Client Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center">
              <div className="flex-shrink-0 h-16 w-16 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-primary-600 font-medium text-2xl">
                  {client.name?.[0] || "?"}
                </span>
              </div>
              <div className="ml-6">
                <h1 className="text-3xl font-bold text-gray-900">
                  {client.name || "Unnamed Client"}
                </h1>
                <p className="text-gray-600 mt-1">{client.email}</p>
                <span
                  className={`mt-2 inline-flex px-2 text-xs leading-5 font-semibold rounded-full ${
                    clientCoach.status === "ACTIVE"
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {clientCoach.status}
                </span>
              </div>
            </div>
            <Link
              href="/coach/programs/ai-builder"
              className="bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 transition"
            >
              🤖 Create Program
            </Link>
          </div>
        </div>

        {/* Client Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Profile Details</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Start Date</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(clientCoach.startDate).toLocaleDateString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Goals</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {client.clientProfile?.goals.join(", ") || "No goals set"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Equipment</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {client.clientProfile?.equipment.join(", ") || "No equipment listed"}
                </dd>
              </div>
              {client.clientProfile?.injuries && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Injuries/Limitations</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {client.clientProfile.injuries}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Quick Stats</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Total Programs</dt>
                <dd className="mt-1 text-2xl font-semibold text-gray-900">{programs.length}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Active Programs</dt>
                <dd className="mt-1 text-2xl font-semibold text-gray-900">
                  {programs.filter((p) => p.isActive).length}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Programs */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Training Programs</h2>
          {programs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="mb-4">No programs created yet</p>
              <Link
                href="/coach/programs/ai-builder"
                className="inline-block bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 transition"
              >
                🤖 Create First Program
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {programs.map((program) => (
                <Link
                  key={program.id}
                  href={`/coach/programs/${program.id}`}
                  className="block border border-gray-200 rounded-lg p-4 hover:border-primary-600 hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">{program.name}</h3>
                      <p className="text-sm text-gray-600 mb-2">
                        {program.description || "No description"}
                      </p>
                      <div className="flex gap-4 text-sm text-gray-500">
                        <span>{program.mesocycles.length} mesocycles</span>
                        <span>•</span>
                        <span>{program.totalWeeks} weeks</span>
                        <span>•</span>
                        <span>Started {new Date(program.startDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        program.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {program.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
