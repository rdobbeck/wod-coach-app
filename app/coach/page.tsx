import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import DashboardHeader from "@/components/DashboardHeader"

export default async function CoachDashboard() {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== "COACH") {
    redirect("/")
  }

  const clients = await prisma.clientCoach.findMany({
    where: {
      coachId: session.user.id,
      status: "ACTIVE"
    },
    include: {
      client: {
        include: {
          clientProfile: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  })

  const programs = await prisma.program.findMany({
    where: {
      coachId: session.user.id,
      isActive: true
    },
    include: {
      mesocycles: true
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 5
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Coach Dashboard</h1>
          <p className="mt-2 text-gray-600">Welcome back, {session.user.name}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">Active Clients</div>
            <div className="mt-2 text-3xl font-semibold text-gray-900">{clients.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">Active Programs</div>
            <div className="mt-2 text-3xl font-semibold text-gray-900">{programs.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">Messages</div>
            <div className="mt-2 text-3xl font-semibold text-gray-900">0</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Link
              href="/coach/clients/new"
              className="bg-primary-600 text-white rounded-lg px-4 py-3 text-center hover:bg-primary-700 transition"
            >
              Add Client
            </Link>
            <Link
              href="/coach/programs/new"
              className="bg-primary-600 text-white rounded-lg px-4 py-3 text-center hover:bg-primary-700 transition"
            >
              Create Program
            </Link>
            <Link
              href="/coach/exercises"
              className="bg-white border-2 border-gray-300 rounded-lg px-4 py-3 text-center hover:border-primary-600 transition"
            >
              Exercise Library
            </Link>
            <Link
              href="/coach/messages"
              className="bg-white border-2 border-gray-300 rounded-lg px-4 py-3 text-center hover:border-primary-600 transition"
            >
              Messages
            </Link>
          </div>
        </div>

        {/* Clients List */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Active Clients</h2>
            <Link href="/coach/clients" className="text-primary-600 hover:text-primary-700">
              View All →
            </Link>
          </div>
          {clients.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <p className="text-gray-500">No active clients yet. Add your first client to get started!</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Client
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Goals
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Start Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {clients.map((clientCoach) => (
                    <tr key={clientCoach.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-primary-100 rounded-full flex items-center justify-center">
                            <span className="text-primary-600 font-medium">
                              {clientCoach.client.name?.[0] || "?"}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {clientCoach.client.name || "Unnamed Client"}
                            </div>
                            <div className="text-sm text-gray-500">{clientCoach.client.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {clientCoach.client.clientProfile?.goals.join(", ") || "No goals set"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(clientCoach.startDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <Link
                          href={`/coach/clients/${clientCoach.clientId}`}
                          className="text-primary-600 hover:text-primary-900 mr-4"
                        >
                          View
                        </Link>
                        <Link
                          href={`/coach/programs/new?clientId=${clientCoach.clientId}`}
                          className="text-primary-600 hover:text-primary-900"
                        >
                          Create Program
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Programs */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Recent Programs</h2>
            <Link href="/coach/programs" className="text-primary-600 hover:text-primary-700">
              View All →
            </Link>
          </div>
          {programs.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <p className="text-gray-500">No programs created yet. Create your first program!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {programs.map((program) => (
                <Link
                  key={program.id}
                  href={`/coach/programs/${program.id}`}
                  className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
                >
                  <h3 className="font-semibold text-gray-900 mb-2">{program.name}</h3>
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                    {program.description || "No description"}
                  </p>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>{program.mesocycles.length} mesocycles</span>
                    <span>{new Date(program.startDate).toLocaleDateString()}</span>
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
