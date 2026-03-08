import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import DashboardHeader from "@/components/DashboardHeader"
import AddClientForm from "@/components/clients/AddClientForm"

export default async function AddClientPage() {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== "COACH") {
    redirect("/")
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Add New Client</h1>
          <p className="mt-2 text-gray-600">
            Add a new client to your coaching roster
          </p>
        </div>

        <AddClientForm coachId={session.user.id} />
      </div>
    </div>
  )
}
