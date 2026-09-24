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
    <div className="min-h-screen bg-[#f4f2ed]">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="font-display text-4xl font-bold text-[#16181d]">Add a client</h1>
          <p className="mt-2 text-[#6b6257]">
            Nothing is sent to them yet. Next you'll build their program and text them a sign-in link.
          </p>
        </div>

        <AddClientForm coachId={session.user.id} />
      </div>
    </div>
  )
}
