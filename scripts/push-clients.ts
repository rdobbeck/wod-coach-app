/**
 * Sends one push notification to every active client of a coach who has a
 * push device registered. Prints who got it. Dead devices are cleaned up by
 * lib/notify.ts as it goes.
 *   npx tsx scripts/push-clients.ts <schema> <coachEmail> "<title>" "<body>" [url] [tag]
 * e.g.
 *   npx tsx scripts/push-clients.ts public dobbecktraining@gmail.com "Book with Ryan from the app" \
 *     "You can now book a session, grab a spot in my CrossFit classes, or text me, all from Today." /client booking-live
 * The tag makes a re-run replace the notification on a device instead of stacking a second one.
 */
import { config } from "dotenv"
config({ path: ".env.local" })
const [schema, email, title, body, url = "/client", tag] = process.argv.slice(2)
if (!schema || !email || !title || !body) throw new Error('usage: push-clients.ts <schema> <coachEmail> "<title>" "<body>" [url] [tag]')
process.env.DB_SCHEMA = schema === "public" ? "" : schema
// A one-off script talks to Postgres directly rather than through the pooler.
if (process.env.POSTGRES_URL_NON_POOLING) process.env.POSTGRES_PRISMA_URL = process.env.POSTGRES_URL_NON_POOLING

async function main() {
  const { prisma } = await import("../lib/prisma")
  const { notifyUser } = await import("../lib/notify")
  const coach = await prisma.user.findFirstOrThrow({ where: { email: { equals: email, mode: "insensitive" }, role: "COACH" }, select: { id: true, name: true } })
  const links = await prisma.clientCoach.findMany({
    where: { coachId: coach.id, status: "ACTIVE" },
    select: { client: { select: { id: true, name: true, email: true, _count: { select: { pushSubscriptions: true } } } } },
  })
  const withPush = links.filter((l) => l.client._count.pushSubscriptions > 0)
  console.log(`${coach.name}: ${links.length} active clients, ${withPush.length} with push devices`)
  let sent = 0
  let removed = 0
  for (const { client } of withPush) {
    const r = await notifyUser(client.id, { title, body, url, tag })
    sent += r.sent
    removed += r.removed
    console.log(`  ${client.name ?? client.email}: sent ${r.sent}${r.removed ? `, dead devices removed ${r.removed}` : ""}`)
  }
  console.log(`total sent ${sent}, removed ${removed}`)
  await prisma.$disconnect()
}
main()
