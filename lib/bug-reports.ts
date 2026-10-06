import { prisma } from "./prisma"

/** Problems clients reported that nobody has marked handled yet, newest first. */
export async function openBugReports(coachId?: string) {
  return prisma.bugReport.findMany({
    where: { resolvedAt: null, ...(coachId ? { user: { coaches: { some: { coachId } } } } : {}) },
    orderBy: { createdAt: "desc" },
    select: { id: true, body: true, path: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
  })
}

/** How old a report is, in whole days. */
export const daysOpen = (createdAt: Date, now = new Date()) => Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000)

/**
 * The morning nag: one line per open report so none of them sit forgotten.
 * Returns null when there is nothing open, so the caller can stay quiet.
 */
export function digestText(reports: { body: string; createdAt: Date; user: { name: string | null; email: string | null } }[], now = new Date()) {
  if (!reports.length) return null
  const lines = reports.slice(0, 8).map((r) => {
    const who = r.user.name ?? r.user.email ?? "A client"
    const d = daysOpen(r.createdAt, now)
    const age = d === 0 ? "today" : d === 1 ? "1 day" : `${d} days`
    const first = r.body.trim().split(/\n/)[0] || "(screenshot only)"
    return `${who} (${age}): ${first.slice(0, 70)}${first.length > 70 ? "…" : ""}`
  })
  const more = reports.length > 8 ? `\n+${reports.length - 8} more` : ""
  return `${lines.join("\n")}${more}\nwod.coach/coach/bugs`
}
