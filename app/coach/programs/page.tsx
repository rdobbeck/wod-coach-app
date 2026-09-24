import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import DashboardHeader from "@/components/DashboardHeader"
import EmptyState from "@/components/coach/EmptyState"

export default async function AllProgramsPage() {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== "COACH") {
    redirect("/")
  }

  const programs = await prisma.program.findMany({
    where: {
      coachId: session.user.id,
    },
    include: {
      mesocycles: true,
      client: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  return (
    <div className="min-h-screen bg-[#f4f2ed]">
      <DashboardHeader userName={session.user.name || "Coach"} role="COACH" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="font-display text-4xl font-bold text-[#16181d]">Programs</h1>
            <p className="mt-2 text-[#6b6257]">Every block you&rsquo;ve built or imported, newest first</p>
          </div>
          <Link
            href="/coach/programs/ai-builder"
            className="rounded-xl bg-[#16181d] px-4 py-2 text-sm font-semibold text-[#f4f1ea]"
          >
            Build a program
          </Link>
        </div>

        {programs.length === 0 ? (
          <EmptyState
            title="Build your first program"
            body="Answer a few questions and AI drafts a periodized block for a client. You review and edit every session before they see it."
            href="/coach/programs/ai-builder"
            cta="Build a program"
            secondary={{ href: "/coach/clients/new", label: "Add a client first" }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {programs.map((program) => (
              <Link
                key={program.id}
                href={`/coach/programs/${program.id}`}
                className="rounded-2xl border border-[#e4dfd5] bg-white p-6 transition hover:border-[#c9c1b3]"
              >
                <div className="flex items-start justify-between mb-4">
                  <h3 className="font-semibold text-[#16181d] text-lg">{program.name}</h3>
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      program.isActive
                        ? "bg-[#e3f1e8] text-[#2f7d4f]"
                        : "bg-[#efeae1] text-[#6b6257]"
                    }`}
                  >
                    {program.isDraft ? "Draft" : program.isActive ? "Active" : "Finished"}
                  </span>
                </div>

                <p className="text-sm text-[#6b6257] mb-4 line-clamp-2">
                  {program.description || "No description"}
                </p>

                {program.client && (
                  <div className="text-sm text-[#857c70] mb-4">
                    <span className="font-medium">Client:</span> {program.client.name}
                  </div>
                )}

                <div className="border-t border-[#efeae1] pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#857c70]">Duration</span>
                    <span className="font-medium text-[#16181d]">
                      {program.endDate ? Math.ceil((new Date(program.endDate).getTime() - new Date(program.startDate).getTime()) / (7 * 24 * 60 * 60 * 1000)) : 0} weeks
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#857c70]">Mesocycles</span>
                    <span className="font-medium text-[#16181d]">{program.mesocycles.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#857c70]">Started</span>
                    <span className="font-medium text-[#16181d]">
                      {new Date(program.startDate).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
