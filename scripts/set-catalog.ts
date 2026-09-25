/**
 * Bring a coach's products in line with lib/pay/catalog.ts: existing items are
 * updated in place by name (keeping their id, their on/off state and any payment
 * history that points at them), and missing ones are added. Nothing is deleted.
 *   npx tsx --env-file=.env.local scripts/set-catalog.ts <coach email> [--apply]
 */
import { PrismaClient } from "@prisma/client"
import { USUAL_CATALOG } from "../lib/pay/catalog"

const email = process.argv[2]
const apply = process.argv.includes("--apply")
if (!email) throw new Error("usage: set-catalog.ts <coach email> [--apply]")
const p = new PrismaClient({ datasources: { db: { url: process.env.POSTGRES_URL_NON_POOLING } } })
const usd = (c: number) => `$${(c / 100).toFixed(2)}`

;(async () => {
  const coach = await p.user.findFirstOrThrow({ where: { email: { equals: email, mode: "insensitive" }, role: "COACH" }, select: { id: true } })
  const have = await p.product.findMany({ where: { coachId: coach.id } })
  const byName = new Map(have.map((h) => [h.name.toLowerCase(), h]))
  for (let i = 0; i < USUAL_CATALOG.length; i++) {
    const c = USUAL_CATALOG[i]
    const cur = byName.get(c.name.toLowerCase())
    const data = { description: c.description, priceCents: c.priceCents, sessions: c.sessions, sortOrder: i + 1 }
    if (cur) {
      console.log(`update  ${c.name.padEnd(22)} ${usd(cur.priceCents)} -> ${usd(c.priceCents)}${cur.active ? "" : "  (stays off)"}`)
      if (apply) await p.product.update({ where: { id: cur.id }, data })
    } else {
      console.log(`add     ${c.name.padEnd(22)} ${usd(c.priceCents)}`)
      if (apply) await p.product.create({ data: { coachId: coach.id, name: c.name, active: true, ...data } })
    }
  }
  const extra = have.filter((h) => !USUAL_CATALOG.some((c) => c.name.toLowerCase() === h.name.toLowerCase()))
  extra.forEach((h) => console.log(`left    ${h.name} (not in the catalog, untouched)`))
  console.log(apply ? "\nAPPLIED" : "\nDRY RUN (add --apply)")
})().catch((e) => console.log("ERR", String(e.message ?? e).split("\n").filter(Boolean).pop())).finally(() => p.$disconnect())
