import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withAlert } from "@/lib/alert"
import { METHODS, parseDollars, type Method } from "@/lib/pay/money"
import { recordManual } from "@/lib/pay/ledger"

/** The coach records a payment they received themselves: cash, or a Venmo or transfer they saw arrive. */
async function handlePOST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { clientId?: string; amount?: string | number; method?: string; description?: string; note?: string; date?: string }

  const amountCents = parseDollars(b.amount ?? "")
  if (amountCents === null) return NextResponse.json({ error: "Enter an amount between $1 and $5,000." }, { status: 400 })
  if (!b.method || !(METHODS as readonly string[]).includes(b.method) || b.method === "STRIPE") {
    return NextResponse.json({ error: "Pick how it was paid." }, { status: 400 })
  }
  const description = b.description?.trim().slice(0, 200)
  if (!description) return NextResponse.json({ error: "Say what it was for." }, { status: 400 })

  let clientId: string | null = null
  if (b.clientId) {
    const link = await prisma.clientCoach.findUnique({ where: { clientId_coachId: { clientId: b.clientId, coachId: session.user.id } }, select: { id: true } })
    if (!link) return NextResponse.json({ error: "Pick one of your clients." }, { status: 400 })
    clientId = b.clientId
  }
  const at = b.date && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? new Date(`${b.date}T12:00:00.000Z`) : undefined
  if (at && at.getTime() > Date.now() + 86_400_000) return NextResponse.json({ error: "That date is in the future." }, { status: 400 })

  const id = await recordManual({ coachId: session.user.id, clientId, amountCents, method: b.method as Method, description, note: b.note?.trim().slice(0, 1000) || null, at })
  return NextResponse.json({ ok: true, id })
}
export const POST = withAlert("payments/record", handlePOST)
