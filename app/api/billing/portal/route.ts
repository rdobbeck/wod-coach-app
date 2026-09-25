import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { customerFor } from "@/lib/billing"
import { appOrigin, platformStripe } from "@/lib/stripe-platform"

/** Stripe's billing portal: change plan, update card, invoices, cancel. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const { customerId } = await customerFor(session.user.id)
    const portal = await platformStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appOrigin(req)}/coach/settings/billing`,
    })
    return NextResponse.json({ url: portal.url })
  } catch (e) {
    console.error("[billing] portal failed:", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
