import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import DashboardHeader from "@/components/DashboardHeader"
import LoomRecorder from "@/components/loom/LoomRecorder"

export default async function CoachMessagesPage() {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== "COACH") {
    redirect("/")
  }

  // Get coach's clients
  const clients = await prisma.clientCoach.findMany({
    where: {
      coachId: session.user.id,
      status: "ACTIVE",
    },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  // Get sent video messages
  const sentVideos = await prisma.videoMessage.findMany({
    where: {
      senderId: session.user.id,
    },
    include: {
      receiver: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 10,
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Video Messages</h1>
          <p className="mt-2 text-gray-600">
            Send personalized video messages to your clients using Loom
          </p>
        </div>

        {/* Send Video Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Send Video Message</h2>

          {clients.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No active clients. Add a client to send video messages!</p>
            </div>
          ) : (
            <div className="space-y-6">
              <p className="text-gray-600">Select a client to send a video message:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {clients.map((clientCoach) => (
                  <div key={clientCoach.id} className="border-2 border-gray-200 rounded-lg p-4 hover:border-primary-600 transition">
                    <div className="flex items-center mb-4">
                      <div className="flex-shrink-0 h-12 w-12 bg-primary-100 rounded-full flex items-center justify-center">
                        <span className="text-primary-600 font-medium text-lg">
                          {clientCoach.client.name?.[0] || "?"}
                        </span>
                      </div>
                      <div className="ml-3">
                        <div className="font-semibold text-gray-900">
                          {clientCoach.client.name || "Unnamed Client"}
                        </div>
                        <div className="text-sm text-gray-500">{clientCoach.client.email}</div>
                      </div>
                    </div>
                    <LoomRecorder
                      coachId={session.user.id}
                      clientId={clientCoach.clientId}
                      clientName={clientCoach.client.name || "your client"}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recent Videos */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Recent Video Messages Sent</h2>

          {sentVideos.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No video messages sent yet. Record your first one above!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sentVideos.map((video) => (
                <div key={video.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">
                        {video.title || "Untitled Video"}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        To: {video.receiver.name || video.receiver.email}
                      </p>
                      {video.description && (
                        <p className="text-sm text-gray-500 mt-2">{video.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-3">
                        <span className="text-xs text-gray-400">
                          {new Date(video.createdAt).toLocaleString()}
                        </span>
                        <a
                          href={video.loomShareUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary-600 hover:text-primary-700"
                        >
                          View on Loom →
                        </a>
                      </div>
                    </div>
                    <div>
                      {video.isRead ? (
                        <span className="text-xs text-gray-500">✓ Read</span>
                      ) : (
                        <span className="text-xs text-gray-400">Unread</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">💡 About Loom Video Messages</h3>
          <ul className="text-sm text-blue-800 space-y-2">
            <li>• <strong>Screen + Camera:</strong> Perfect for program walkthroughs and exercise demos</li>
            <li>• <strong>Camera Only:</strong> Great for motivational messages and check-ins</li>
            <li>• <strong>Screen Only:</strong> Ideal for analyzing form videos or reviewing data</li>
            <li>• <strong>No sign-up required:</strong> Clients can watch videos without a Loom account</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
