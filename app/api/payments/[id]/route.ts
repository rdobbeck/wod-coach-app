import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withAlert } from "@/lib/alert"
import { decidePayment } from "@/lib/pay/ledger"

/** Confirm (the money arrived) or reject (it did not) a payment a client says they sent. */
async function handlePATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { confirm } = (await req.json().catch(() => ({}))) as { confirm?: boolean }
  if (typeof confirm !== "boolean") return NextResponse.json({ error: "confirm must be true or false" }, { status: 400 })
  const r = await decidePayment(session.user.id, params.id, confirm)
  return NextResponse.json(r, { status: r.ok ? 200 : 404 })
}
export const PATCH = withAlert("payments/decide", handlePATCH)
