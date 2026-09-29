import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { ownerEmails } from "@/lib/plans"
import { billingConfigured } from "@/lib/stripe-platform"
import { ensureCatalog, missingPrices } from "@/lib/stripe-catalog"

export const maxDuration = 60

/**
 * Owner only: create the plans, prices and billing portal in the Stripe account
 * the server is configured with, using the key already in Vercel, so nobody has
 * to copy a secret key to run scripts/stripe-setup.ts.
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  const email = session?.user.email?.toLowerCase()
  if (!session || session.user.role !== "COACH" || !email || !ownerEmails().includes(email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!billingConfigured()) return NextResponse.json({ error: "No Stripe key is set on the server." }, { status: 409 })
  try {
    const log = await ensureCatalog()
    return NextResponse.json({ ok: true, log, missing: await missingPrices() })
  } catch (e) {
    console.error("[billing] catalog setup failed:", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
