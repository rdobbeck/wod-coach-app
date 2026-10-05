import Link from "next/link"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { smsHref } from "@/lib/booking"
import { loadClasses } from "@/lib/classes"
import { requireClient } from "@/lib/require-client"
import ClassList from "@/components/client/ClassList"

export const dynamic = "force-dynamic"

/** Client books a group class the coach teaches, from the coach's class feed. */
export default async function BookClass() {
  const session = await requireClient()
  const link = await prisma.clientCoach.findFirst({
    where: { clientId: session.user.id, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: {
      coach: { select: { name: true, email: true, coachProfile: { select: { textNumber: true, classFeedUrl: true, calendarTz: true } } } },
    },
  })
  const coachName = link?.coach.name ?? link?.coach.email ?? "your coach"
  const firstName = coachName.split(" ")[0]
  const classes = await loadClasses(link?.coach.coachProfile?.classFeedUrl, link?.coach.coachProfile?.calendarTz ?? "America/Chicago")
  if (!classes) redirect("/client")
  const text = smsHref(link?.coach.coachProfile?.textNumber, `Hi ${firstName}, I'm coming to your class.`)

  return (
    <div className="space-y-4">
      <header>
        <Link href="/client" className="text-sm text-app-muted">
          &larr; Today
        </Link>
        <h1 className="mt-1 font-display text-4xl font-bold leading-none">Book a class</h1>
        <p className="mt-1 text-sm text-app-muted">
          {classes.classes.length
            ? `Every class ${firstName} is coaching${classes.gym.name ? ` at ${classes.gym.name}` : ""}, soonest first.`
            : `${firstName} has nothing on the class schedule right now.`}
        </p>
      </header>
      <ClassList classes={classes} firstName={firstName} text={text} />
    </div>
  )
}
