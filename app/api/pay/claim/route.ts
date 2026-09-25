import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withAlert } from "@/lib/alert"
import { claimPayment } from "@/lib/pay/ledger"

/** "I sent it": a client says they paid by Venmo or bank. It waits for the coach to confirm. */
async function handlePOST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "CLIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { productId, method } = (await req.json().catch(() => ({}))) as { productId?: string; method?: string }
  if (!productId || (method !== "VENMO" && method !== "BANK")) return NextResponse.json({ error: "productId and a method (VENMO or BANK) are required" }, { status: 400 })

  const link = await prisma.clientCoach.findFirst({ where: { clientId: session.user.id, status: "ACTIVE" }, select: { coachId: true } })
  if (!link) return NextResponse.json({ error: "You are not linked to a coach yet." }, { status: 404 })
  const r = await claimPayment({ coachId: link.coachId, clientId: session.user.id, productId, method })
  return NextResponse.json(r, { status: r.ok ? 200 : 404 })
}
export const POST = withAlert("pay/claim", handlePOST)
