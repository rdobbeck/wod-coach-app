#!/usr/bin/env tsx
/**
 * Import CoachRx clients (profile + full workout history + comments) from an
 * export made by export-coachrx.ts. Reads only local JSON; never calls CoachRx.
 *
 *   npm run import:coachrx -- --client sasha-letchinger --coach you@example.com [--dry-run]
 *   options: --export <dir> (default: newest backups/coachrx-export-*), repeat --client
 *
 *   Schedule a CoachRx program template as a new block for a client:
 *   npm run import:coachrx -- --client <slug> --coach <email> --program <id> --start 2026-09-28
 *   Template day N lands on start + N-1. Re-running with another --start moves the block.
 *
 * Idempotent: every row is keyed on its CoachRx id, so re-running updates in place.
 * Exercises are linked to ExerciseLibrary by normalized name (client calendar rows
 * carry no exercise ids); unmatched names are listed in the dry run.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { exerciseKey } from "../lib/exercise-key";
import { buildExerciseMatcher } from "../lib/exercise-match";
import { noLongDashes } from "../lib/text";

// Imports into production (public schema) regardless of DB_SCHEMA.
const prisma = new PrismaClient({ datasources: { db: { url: process.env.POSTGRES_PRISMA_URL } } });

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const values = (name: string) =>
  argv.flatMap((a, i) => (a === `--${name}` && argv[i + 1] ? [argv[i + 1]] : []));
const dryRun = flag("dry-run");
const slugs = values("client");
const coachEmail = values("coach")[0]?.toLowerCase();
const programId = values("program")[0];
const startDay = values("start")[0];
const exportDir =
  values("export")[0] ??
  (() => {
    const dirs = readdirSync("backups")
      .filter((d) => d.startsWith("coachrx-export-"))
      .sort();
    if (!dirs.length) throw new Error("No backups/coachrx-export-* found; run npm run export:coachrx");
    return join("backups", dirs[dirs.length - 1]);
  })();

// ---------- CoachRx shapes (only the fields we use) ----------
type CrxItem = {
  id: number | string;
  name: string;
  description: string | null;
  is_circuit: boolean;
  position: number | null;
  status: string;
  result: string | null;
};
type CrxComment = {
  id: number | string;
  body: string;
  created_at: string;
  author: { name: string; type: string; slug?: string } | null;
};
type CrxWorkout = {
  id: number | string;
  due_date: string; // "2025/04/19"
  order: number | null;
  rest_day: boolean;
  rest_day_instructions: string | null;
  title: string | null;
  status: string; // completed | missed | pending
  coach_notes: string | null;
  warmup: string | null;
  cooldown: string | null;
  workout_items: CrxItem[];
  comments: CrxComment[];
  assigned_program: { id: number | string; name: string } | null;
};
type CrxProfile = {
  client: {
    id: number | string;
    slug: string;
    name: string;
    email: string | null;
    weight: number | null;
    can_move_workouts?: boolean;
    user: {
      height: string | null;
      weight: string | null;
      units: string | null;
      gender: string | null;
      birthday: string | null;
      phone_number: string | null;
    };
  };
};

// ---------- helpers ----------
// Trim, and drop em/en dashes: Ryan's copy never uses them.
const clean = (s: string | null | undefined) => (s && s.trim() ? noLongDashes(s.trim()) : null);


// CoachRx dates are calendar days; store at noon UTC so no timezone shifts the day.
const dayDate = (d: string) => new Date(`${d.replace(/\//g, "-")}T12:00:00.000Z`);

async function buildExerciseIndex() {
  // Most reliable: the exercise Ryan picked for the same row name in his program
  // templates (template rows carry CoachRx exercise ids; client calendar rows don't).
  const byCoachrxId = new Map(
    (await prisma.exerciseLibrary.findMany({ where: { coachrxId: { not: null } }, select: { id: true, coachrxId: true } })).map((r) => [r.coachrxId!, r.id])
  );
  const fromTemplates = new Map<string, string>();
  const programDir = join(exportDir, "programs");
  if (existsSync(programDir)) {
    for (const f of readdirSync(programDir)) {
      const { workouts } = JSON.parse(readFileSync(join(programDir, f), "utf8")) as {
        workouts?: { workout_items?: { name: string; workout_item_exercises_attributes?: { exercise_id?: number }[] }[] }[];
      };
      for (const it of (workouts ?? []).flatMap((w) => w.workout_items ?? [])) {
        const crx = it.workout_item_exercises_attributes?.[0]?.exercise_id;
        const id = crx ? byCoachrxId.get(String(crx)) : undefined;
        if (id && !fromTemplates.has(exerciseKey(it.name))) fromTemplates.set(exerciseKey(it.name), id);
      }
    }
  }
  const match = await buildExerciseMatcher(prisma, fromTemplates);
  console.log(`[import] exercise index: ${match.size} library, ${fromTemplates.size} names from program templates`);
  return match;
}

function load<T>(file: string): T {
  const p = join(exportDir, file);
  if (!existsSync(p)) throw new Error(`Missing ${p} (is the export finished for this client?)`);
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

// ---------- import ----------
async function importClient(slug: string, coachId: string | null, match: (n: string) => string | null) {
  const profile = load<CrxProfile>(`clients/${slug}.profile.json`).client;
  const workouts = load<{ workouts: CrxWorkout[] }>(`clients/${slug}.workouts.json`).workouts;
  const listed = load<{ clients: { slug: string; can_move_workouts: boolean; state?: string }[] }>("clients.json").clients.find(
    (c) => c.slug === slug
  );

  const items = workouts.flatMap((w) => w.workout_items);
  const unmatched = new Map<string, number>();
  for (const it of items) if (!match(it.name)) unmatched.set(it.name, (unmatched.get(it.name) ?? 0) + 1);
  const programs = new Map<string, CrxWorkout[]>();
  for (const w of workouts) {
    const pid = w.assigned_program ? String(w.assigned_program.id) : "";
    if (pid) programs.set(pid, [...(programs.get(pid) ?? []), w]);
  }
  const summary = {
    client: profile.name,
    workouts: workouts.length,
    completed: workouts.filter((w) => w.status === "completed").length,
    programs: programs.size,
    exerciseRows: items.length,
    linked: items.length - Array.from(unmatched.values()).reduce((a, b) => a + b, 0),
    results: items.filter((i) => clean(i.result)).length,
    comments: workouts.reduce((n, w) => n + w.comments.length, 0),
  };
  console.log(`[import] ${slug}: ${JSON.stringify(summary)}`);
  const top = Array.from(unmatched.entries()).sort((a, b) => b[1] - a[1]);
  if (top.length) {
    console.log(`[import]   ${top.length} unmatched exercise names (top 25):`);
    for (const [n, c] of top.slice(0, 25)) console.log(`             ${c}x  ${n}`);
  }
  if (dryRun || !coachId) return;

  // Client user + profile + link to coach
  const email = clean(profile.email)?.toLowerCase() ?? `${slug}@coachrx-import.local`;
  const crxId = String(profile.id);
  const existing =
    (await prisma.user.findUnique({ where: { coachrxId: crxId } })) ??
    (await prisma.user.findUnique({ where: { email } }));
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { coachrxId: crxId, name: existing.name ?? profile.name } })
    : await prisma.user.create({ data: { email, name: profile.name, role: "CLIENT", coachrxId: crxId } });

  const u = profile.user;
  const num = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));
  const profileData = {
    dateOfBirth: u.birthday ? new Date(u.birthday) : null,
    gender: clean(u.gender),
    height: num(u.height),
    weight: num(u.weight) ?? num(profile.weight),
    units: u.units === "metric" ? "kg" : "lb",
    phone: clean(u.phone_number),
    canMoveWorkouts: listed?.can_move_workouts ?? true,
    coachrxSlug: slug,
  };
  await prisma.clientProfile.upsert({
    where: { userId: user.id },
    update: profileData,
    create: { userId: user.id, ...profileData },
  });
  await prisma.clientCoach.upsert({
    where: { clientId_coachId: { clientId: user.id, coachId } },
    update: {},
    // Archived in CoachRx means a past client: keep their history, but off the
    // active roster. An existing link is left alone so a re-run never demotes
    // someone the coach has since reactivated.
    create: { clientId: user.id, coachId, status: listed?.state === "archived" ? "INACTIVE" : "ACTIVE" },
  });

  // Programs (one per CoachRx program the client was assigned)
  const programIds = new Map<string, string>();
  for (const [pid, ws] of Array.from(programs.entries())) {
    const dates = ws.map((w) => w.due_date).sort();
    const data = {
      name: ws[0].assigned_program!.name.trim(),
      coachId,
      startDate: dayDate(dates[0]),
      endDate: dayDate(dates[dates.length - 1]),
      isActive: dates[dates.length - 1] >= new Date().toISOString().slice(0, 10).replace(/-/g, "/"),
      programType: "COACHRX_IMPORT",
      goals: [],
    };
    const p = await prisma.program.upsert({
      where: { clientId_coachrxProgramId: { clientId: user.id, coachrxProgramId: pid } },
      update: data,
      create: { ...data, clientId: user.id, coachrxProgramId: pid },
    });
    programIds.set(pid, p.id);
  }

  // Workouts, exercises, logs, comments
  let done = 0;
  for (const w of workouts) {
    const date = dayDate(w.due_date);
    const wData = {
      clientId: user.id,
      programId: w.assigned_program ? programIds.get(String(w.assigned_program.id)) ?? null : null,
      name: clean(w.title) ?? (w.rest_day ? "Rest day" : "Workout"),
      description: w.rest_day ? clean(w.rest_day_instructions) : null,
      coachNotes: clean(w.coach_notes),
      warmup: clean(w.warmup),
      cooldown: clean(w.cooldown),
      scheduledDate: date,
      dayOfWeek: date.getUTCDay(),
      order: w.order ?? 1,
      isCompleted: w.status === "completed",
    };
    const workout = await prisma.workout.upsert({
      where: { coachrxId: String(w.id) },
      update: wData,
      create: { ...wData, coachrxId: String(w.id) },
    });

    const weIds = new Map<string, string>();
    for (let idx = 0; idx < w.workout_items.length; idx++) {
      const it = w.workout_items[idx];
      const eData = {
        workoutId: workout.id,
        exerciseId: match(it.name),
        name: noLongDashes(it.name.trim()),
        prescription: clean(it.description),
        supersetGroup: it.is_circuit ? "circuit" : null,
        order: it.position ?? idx + 1,
      };
      const we = await prisma.workoutExercise.upsert({
        where: { coachrxItemId: String(it.id) },
        update: eData,
        create: { ...eData, coachrxItemId: String(it.id) },
      });
      weIds.set(String(it.id), we.id);
    }

    if (w.status === "completed") {
      const log = await prisma.workoutLog.upsert({
        where: { workoutId_userId: { workoutId: workout.id, userId: user.id } },
        update: { completedAt: date },
        create: { workoutId: workout.id, userId: user.id, completedAt: date },
      });
      for (const it of w.workout_items) {
        const resultText = clean(it.result);
        if (!resultText && it.status !== "completed") continue;
        const xData = {
          userId: user.id,
          exerciseId: match(it.name),
          exerciseKey: exerciseKey(it.name),
          resultText,
          performedAt: date,
        };
        await prisma.exerciseLog.upsert({
          where: { workoutLogId_workoutExerciseId: { workoutLogId: log.id, workoutExerciseId: weIds.get(String(it.id))! } },
          update: xData,
          create: { ...xData, workoutLogId: log.id, workoutExerciseId: weIds.get(String(it.id))! },
        });
      }
    }

    for (const c of w.comments) {
      const byClient = c.author?.type === "Client";
      const cData = {
        workoutId: workout.id,
        authorId: byClient ? user.id : coachId,
        authorName: c.author?.name ?? "Unknown",
        body: c.body,
        createdAt: new Date(c.created_at),
      };
      await prisma.workoutComment.upsert({
        where: { coachrxId: String(c.id) },
        update: cData,
        create: { ...cData, coachrxId: String(c.id) },
      });
    }
    if (++done % 25 === 0) console.log(`[import]   ${slug}: ${done}/${workouts.length} workouts`);
  }
  console.log(`[import] ${slug}: imported as user ${user.id} (${email})`);
}

type TplItem = CrxItem & { workout_item_exercises_attributes?: { exercise_id?: number }[] };
type TplWorkout = Omit<CrxWorkout, "workout_items"> & { position: number | null; workout_items: TplItem[] };

/** Put a program template on a client's calendar starting at `startDay` (YYYY-MM-DD). */
async function scheduleProgram(slug: string, coachId: string | null, match: (n: string) => string | null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDay ?? "")) throw new Error("--start YYYY-MM-DD is required with --program");
  const workouts = load<{ workouts: TplWorkout[] }>(`programs/${programId}.workouts.json`).workouts;
  const meta = load<{ programs: { id: number | string; name: string }[] }>("programs.json").programs.find((p) => String(p.id) === programId);
  const libByCrx = new Map(
    (await prisma.exerciseLibrary.findMany({ where: { coachrxId: { not: null } }, select: { id: true, coachrxId: true } })).map((r) => [r.coachrxId!, r.id])
  );
  const exerciseFor = (it: TplItem) => {
    const crx = it.workout_item_exercises_attributes?.[0]?.exercise_id;
    return (crx ? libByCrx.get(String(crx)) : undefined) ?? match(it.name);
  };
  const start = dayDate(startDay!.replace(/-/g, "/"));
  const dateFor = (w: TplWorkout) => new Date(start.getTime() + ((w.position ?? 1) - 1) * 86_400_000);
  const items = workouts.flatMap((w) => w.workout_items);
  const last = workouts.reduce((d, w) => (dateFor(w) > d ? dateFor(w) : d), start);
  console.log(
    `[import] ${slug}: schedule "${meta?.name?.trim() ?? programId}" ${startDay} -> ${last.toISOString().slice(0, 10)}: ` +
      `${workouts.length} workouts, ${items.length} exercise rows, ${items.filter((i) => exerciseFor(i)).length} linked`
  );
  if (dryRun || !coachId) return;

  const user = await prisma.user.findFirst({ where: { clientProfile: { coachrxSlug: slug } } });
  if (!user) throw new Error(`${slug} isn't imported yet; run the client import first`);
  // One scheduled copy per template per client; a new --start moves it (repeat blocks: duplicate in-app).
  const key = `tpl:${programId}`;
  const program = await prisma.program.upsert({
    where: { clientId_coachrxProgramId: { clientId: user.id, coachrxProgramId: key } },
    update: { name: meta?.name?.trim() ?? "Program", startDate: start, endDate: last, isActive: true },
    create: { name: meta?.name?.trim() ?? "Program", coachId, clientId: user.id, coachrxProgramId: key, startDate: start, endDate: last, isActive: true, programType: "COACHRX_TEMPLATE", goals: [] },
  });
  for (const w of workouts) {
    const date = dateFor(w);
    const data = {
      clientId: user.id,
      programId: program.id,
      name: clean(w.title) ?? (w.rest_day ? "Rest day" : "Workout"),
      description: w.rest_day ? clean(w.rest_day_instructions) : null,
      coachNotes: clean(w.coach_notes),
      warmup: clean(w.warmup),
      cooldown: clean(w.cooldown),
      scheduledDate: date,
      dayOfWeek: date.getUTCDay(),
      order: w.order ?? 1,
    };
    // Keyed per client + template workout, so re-running (or a new --start) updates in place.
    const wKey = `tpl:${w.id}:${user.id}`;
    const workout = await prisma.workout.upsert({ where: { coachrxId: wKey }, update: data, create: { ...data, coachrxId: wKey } });
    for (let i = 0; i < w.workout_items.length; i++) {
      const it = w.workout_items[i];
      const eData = {
        workoutId: workout.id,
        exerciseId: exerciseFor(it),
        name: noLongDashes(it.name.trim()),
        prescription: clean(it.description),
        supersetGroup: it.is_circuit ? "circuit" : null,
        order: it.position ?? i + 1,
      };
      const iKey = `tpl:${it.id}:${user.id}`;
      await prisma.workoutExercise.upsert({ where: { coachrxItemId: iKey }, update: eData, create: { ...eData, coachrxItemId: iKey } });
    }
  }
  console.log(`[import] ${slug}: scheduled ${workouts.length} workouts (program ${program.id})`);
}

async function main() {
  if (!slugs.length) throw new Error("Pass at least one --client <slug>");
  let coachId: string | null = null;
  if (!dryRun) {
    if (!coachEmail) throw new Error("Pass --coach <email of your WOD Coach account> (or --dry-run)");
    const coach = await prisma.user.findUnique({ where: { email: coachEmail } });
    if (!coach || coach.role !== "COACH") throw new Error(`No COACH account with email ${coachEmail}; sign up first`);
    coachId = coach.id;
  }
  console.log(`[import] from ${exportDir}${dryRun ? " (dry run, nothing written)" : ""}`);
  const match = await buildExerciseIndex();
  for (const slug of slugs) {
    if (programId) await scheduleProgram(slug, coachId, match);
    else await importClient(slug, coachId, match);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(`[import] ERROR: ${(e as Error).message}`);
    await prisma.$disconnect();
    process.exit(1);
  });
