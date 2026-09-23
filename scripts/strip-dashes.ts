#!/usr/bin/env tsx
/**
 * Replace em/en dashes in client-visible text (exercise names, prescriptions,
 * workout names and notes, program names). Dry run by default:
 *   npm run strip:dashes            preview the changes
 *   npm run strip:dashes -- --write apply them
 */
import { config as loadDotenv } from "dotenv"
import { resolve } from "node:path"
import { PrismaClient } from "@prisma/client"
import { noLongDashes } from "../lib/text"

loadDotenv({ path: resolve(process.cwd(), ".env.local"), override: true })
const prisma = new PrismaClient({ datasources: { db: { url: process.env.POSTGRES_PRISMA_URL } } })
const write = process.argv.includes("--write")
const has = (s: string | null) => !!s && /[—–]/.test(s)

async function main() {
  let changed = 0
  const show: string[] = []

  const exercises = await prisma.exerciseLibrary.findMany({ where: { name: { contains: "—" } }, select: { id: true, name: true } })
  for (const e of exercises) {
    const name = noLongDashes(e.name)
    show.push(`library: ${e.name}  ->  ${name}`)
    changed++
    if (write) await prisma.exerciseLibrary.update({ where: { id: e.id }, data: { name } })
  }

  const rows = await prisma.workoutExercise.findMany({
    where: { OR: [{ name: { contains: "—" } }, { prescription: { contains: "—" } }, { notes: { contains: "—" } }] },
    select: { id: true, name: true, prescription: true, notes: true },
  })
  for (const r of rows) {
    if (show.length < 12) show.push(`row: ${r.name}  ->  ${noLongDashes(r.name)}`)
    changed++
    if (write)
      await prisma.workoutExercise.update({
        where: { id: r.id },
        data: { name: noLongDashes(r.name), prescription: noLongDashes(r.prescription), notes: noLongDashes(r.notes) },
      })
  }

  const workouts = await prisma.workout.findMany({
    where: {
      OR: [{ name: { contains: "—" } }, { coachNotes: { contains: "—" } }, { warmup: { contains: "—" } }, { cooldown: { contains: "—" } }, { description: { contains: "—" } }],
    },
    select: { id: true, name: true, coachNotes: true, warmup: true, cooldown: true, description: true },
  })
  for (const w of workouts) {
    changed++
    if (write)
      await prisma.workout.update({
        where: { id: w.id },
        data: {
          name: noLongDashes(w.name),
          coachNotes: noLongDashes(w.coachNotes),
          warmup: noLongDashes(w.warmup),
          cooldown: noLongDashes(w.cooldown),
          description: noLongDashes(w.description),
        },
      })
  }

  const programs = await prisma.program.findMany({
    where: { OR: [{ name: { contains: "—" } }, { description: { contains: "—" } }] },
    select: { id: true, name: true, description: true },
  })
  for (const p of programs) {
    changed++
    if (write) await prisma.program.update({ where: { id: p.id }, data: { name: noLongDashes(p.name), description: noLongDashes(p.description) } })
  }

  console.log(show.join("\n"))
  console.log(
    `${write ? "updated" : "would update"}: ${exercises.length} library, ${rows.length} exercise rows, ${workouts.length} workouts, ${programs.length} programs (${changed} records)`
  )
}

main().then(() => prisma.$disconnect(), async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
