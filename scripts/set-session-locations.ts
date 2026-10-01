/**
 * Sets a coach's places to train and their text number, replacing the list.
 *   npx tsx scripts/set-session-locations.ts <schema> <coachEmail> <textNumber|-> "Label=https://cal.com/you/slug" ...
 * e.g.
 *   npx tsx scripts/set-session-locations.ts public dobbecktraining@gmail.com "(773) 491-7926" \
 *     "Off-site (I come to you)=https://cal.com/dobbeck-training-systems/personal-training-offsite" \
 *     "Mag Mile CrossFit=https://cal.com/dobbeck-training-systems/mag-mile-crossfit" \
 *     "Gym Pod=https://cal.com/dobbeck-training-systems/gym-pod"
 * Run scripts/create-session-locations.ts for the schema first.
 */
import { config } from "dotenv"
config({ path: ".env.local" })
import { PrismaClient } from "@prisma/client"
import { bookingFor, normalizePhone } from "../lib/booking"

const [schema, email, phone, ...pairs] = process.argv.slice(2)
if (!schema || !email) throw new Error("usage: set-session-locations.ts <schema> <coachEmail> <textNumber|-> [Label=url ...]")
const base = process.env.POSTGRES_URL_NON_POOLING!
const p = new PrismaClient({ datasources: { db: { url: `${base}${base.includes("?") ? "&" : "?"}schema=${schema}` } } })

async function main() {
  const coach = await p.user.findFirstOrThrow({ where: { email: { equals: email, mode: "insensitive" }, role: "COACH" }, select: { id: true, name: true } })
  const places = pairs.map((pair, i) => {
    const at = pair.indexOf("=")
    const label = pair.slice(0, at).trim()
    const url = bookingFor(pair.slice(at + 1))?.url
    if (!label || !url) throw new Error(`Bad place: ${pair}`)
    return { coachId: coach.id, label, url, sortOrder: i }
  })
  const textNumber = phone && phone !== "-" ? normalizePhone(phone) : null
  if (phone && phone !== "-" && !textNumber) throw new Error(`Bad phone: ${phone}`)

  await p.$transaction([
    p.sessionLocation.deleteMany({ where: { coachId: coach.id } }),
    p.sessionLocation.createMany({ data: places }),
    p.coachProfile.update({ where: { userId: coach.id }, data: { textNumber } }),
  ])
  const saved = await p.sessionLocation.findMany({ where: { coachId: coach.id }, orderBy: { sortOrder: "asc" } })
  console.log(schema, coach.name, "-> text", textNumber ?? "(none)")
  for (const l of saved) console.log("  ", l.label, "->", l.url)
}
main().catch((e) => console.log("ERR", String(e.message).split("\n").filter(Boolean).pop())).finally(() => p.$disconnect())
