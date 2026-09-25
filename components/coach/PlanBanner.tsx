import Link from "next/link"
import { getCoachPlan } from "@/lib/plans"

/** One line under the dashboard greeting: trial days left, trial over, or a failed payment. Nothing otherwise. */
export default async function PlanBanner({ userId }: { userId: string }) {
  const cp = await getCoachPlan(userId)
  let text: string | null = null
  let urgent = false
  if (cp.source === "trial") {
    urgent = (cp.trialDaysLeft ?? 0) <= 3
    text = `Pro trial: ${cp.trialDaysLeft} ${cp.trialDaysLeft === 1 ? "day" : "days"} left. Pick a plan to keep your clients and AI programs.`
  } else if (cp.source === "paid" && cp.status === "past_due") {
    urgent = true
    text = "Your last payment didn't go through. Update your card to keep your plan."
  } else if (cp.source === "free" && cp.trialEndsAt && cp.trialEndsAt.getTime() > Date.now() - 30 * 86_400_000) {
    text = `Your trial ended, so you're on Free (up to ${cp.plan.clients} clients). Your data is all still here.`
  }
  if (!text) return null
  return (
    <Link
      href="/coach/settings/billing"
      className={`mt-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm ${
        urgent ? "border-[#f0c2c4] bg-[#fbe9ea] text-[#8f1d22]" : "border-[#e4dfd5] bg-white text-[#4a443c]"
      }`}
    >
      <span>{text}</span>
      <span className="font-semibold underline">See plans</span>
    </Link>
  )
}
