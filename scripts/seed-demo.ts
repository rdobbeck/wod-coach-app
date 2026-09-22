#!/usr/bin/env tsx
/**
 * Give the demo client (test login) a realistic calendar: past completed workouts
 * with logged sets/RPE, one missed, one today, a few upcoming. Only ever touches
 * demo-client@dev.local; re-running replaces its workouts.
 *
 *   npm run seed:demo
 */
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { exerciseKey } from "../lib/exercise-key";
import { dbUrl } from "../lib/db-url";

// Follows DB_SCHEMA, so demo data lands in the preview schema, not production.
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } });
loadDotenv({ path: resolve(process.cwd(), ".env.local"), override: true });

const DEMO_CLIENT = "demo-client@dev.local";
const DEMO_COACH = "demo-coach@dev.local";

const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

// [name, prescription, sets, reps] per workout; names are looked up in the library.
const A: [string, string, number, string][] = [
  ["Back Squat", "4 x 6 @ RPE 7-8, rest 2-3 min", 4, "6"],
  ["Romanian Deadlift", "3 x 8, 3 sec lower", 3, "8"],
  ["Front Plank", "3 x 45 sec", 3, "45s"],
];
const B: [string, string, number, string][] = [
  ["Bench Press", "4 x 6 @ RPE 7-8", 4, "6"],
  ["Pull-Up", "4 x max reps, leave 1-2 in the tank", 4, "max"],
  ["Dumbbell Row", "3 x 10 each side", 3, "10"],
];

async function main() {
  const client = await prisma.user.findUnique({ where: { email: DEMO_CLIENT } });
  const coach = await prisma.user.findUnique({ where: { email: DEMO_COACH } });
  if (!client || !coach) throw new Error("Sign in once with the test login first so the demo users exist");

  const lib = async (name: string) =>
    prisma.exerciseLibrary.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      orderBy: { videoUrl: { sort: "desc", nulls: "last" } },
    });

  await prisma.workout.deleteMany({ where: { clientId: client.id } });
  await prisma.program.deleteMany({ where: { clientId: client.id } });
  await prisma.clientProfile.upsert({
    where: { userId: client.id },
    update: { canMoveWorkouts: true, units: "lb" },
    create: { userId: client.id, canMoveWorkouts: true, units: "lb" },
  });
  const program = await prisma.program.create({
    data: { name: "Demo Strength Block", coachId: coach.id, clientId: client.id, startDate: day(-14), goals: ["Strength"] },
  });

  // offset, template, completed?, logged top-set weight
  const plan: [number, typeof A, boolean, number][] = [
    [-12, A, true, 135], [-10, B, true, 115], [-7, A, true, 145], [-5, B, true, 120],
    [-2, A, false, 0], [0, B, false, 0], [2, A, false, 0], [4, B, false, 0], [7, A, false, 0],
  ];
  for (const [offset, tpl, done, top] of plan) {
    const date = day(offset);
    const w = await prisma.workout.create({
      data: {
        clientId: client.id, programId: program.id,
        name: tpl === A ? "Lower Strength" : "Upper Strength",
        coachNotes: "Warm up well. Last set should feel like 2 reps left in the tank.",
        warmup: "5 min easy bike\nHip/shoulder CARs x 5 each",
        scheduledDate: date, dayOfWeek: date.getUTCDay(), order: 1, isCompleted: done,
      },
    });
    const log = done ? await prisma.workoutLog.create({ data: { workoutId: w.id, userId: client.id, completedAt: date } }) : null;
    for (let i = 0; i < tpl.length; i++) {
      const [name, prescription, sets, reps] = tpl[i];
      const ex = await lib(name);
      const we = await prisma.workoutExercise.create({
        data: { workoutId: w.id, exerciseId: ex?.id ?? null, name: ex?.name ?? name, prescription, order: i + 1, sets, reps },
      });
      if (!log) continue;
      const weight = i === 0 ? top : i === 1 ? Math.round(top * 0.6) : null;
      const xl = await prisma.exerciseLog.create({
        data: {
          workoutLogId: log.id, workoutExerciseId: we.id, userId: client.id, exerciseId: ex?.id ?? null,
          exerciseKey: exerciseKey(ex?.name ?? name), performedAt: date, rpe: i === 0 ? 8 : 7,
          resultText: weight === null ? "45s, 45s, 40s" : null,
        },
      });
      if (weight !== null) {
        await prisma.setLog.createMany({
          data: Array.from({ length: sets }, (_, s) => ({
            workoutLogId: log.id, workoutExerciseId: we.id, exerciseLogId: xl.id, setNumber: s + 1,
            weight: s === sets - 1 ? weight : weight - 10, reps: Number(reps) || 8, rpe: s === sets - 1 ? 8 : 7,
          })),
        });
      }
    }
  }
  console.log(`[seed-demo] ${plan.length} workouts for ${DEMO_CLIENT}`);
}

main().then(() => prisma.$disconnect(), async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
