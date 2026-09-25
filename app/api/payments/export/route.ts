import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { paymentsCsv } from "@/lib/pay/ledger"

/** The ledger as a spreadsheet for the accountant. ?year=2026 limits it to one year. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const y = Number(new URL(req.url).searchParams.get("year"))
  const year = Number.isInteger(y) && y > 2000 && y < 2100 ? y : null
  const rows = await prisma.payment.findMany({
    where: { coachId: session.user.id, status: { in: ["CONFIRMED", "REFUNDED"] }, ...(year ? { createdAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } } : {}) },
    orderBy: { createdAt: "asc" },
  })
  const names = new Map((await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.clientId).filter(Boolean) as string[] } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name ?? u.email]))
  const csv = paymentsCsv(rows.map((r) => ({ ...r, clientName: (r.clientId && names.get(r.clientId)) || r.payerName || r.payerEmail })))
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="payments${year ? `-${year}` : ""}.csv"` } })
}
