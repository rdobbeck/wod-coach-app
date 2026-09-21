#!/usr/bin/env tsx
/**
 * Full read-only export of CoachRx, so CoachRx can be cancelled without losing data.
 *
 *   npm run export:coachrx            -> backups/coachrx-export-<today>/
 *   npm run export:coachrx -- <dir>   -> resume into an existing export dir
 *
 * Writes raw JSON: clients.json, clients/<slug>.profile.json,
 * clients/<slug>.workouts.json, programs.json, programs/<id>.workouts.json, and a
 * manifest.json with counts. Files that already exist are skipped, so an
 * interrupted run (rate limit, closed tab) resumes where it stopped.
 *
 * Uses scripts/lib/coachrx-read.ts (GET-only allowlist, token stays in the tab).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { coachrxGet } from "./lib/coachrx-read";

// Wide enough to cover every client since the account opened.
const HISTORY_START = "2015-01-01";
const HISTORY_END = "2027-12-31";

const dir = process.argv[2] ?? `backups/coachrx-export-${new Date().toISOString().slice(0, 10)}`;
mkdirSync(join(dir, "clients"), { recursive: true });
mkdirSync(join(dir, "programs"), { recursive: true });

async function save(file: string, path: string): Promise<unknown> {
  const out = join(dir, file);
  if (existsSync(out)) return JSON.parse(readFileSync(out, "utf8"));
  const { status, body } = await coachrxGet(path);
  if (status !== 200) throw new Error(`${path}: HTTP ${status}`);
  writeFileSync(out, JSON.stringify(body, null, 2));
  return body;
}

async function main() {
  const started = Date.now();
  const failures: string[] = [];
  const attempt = async (label: string, fn: () => Promise<unknown>) => {
    try {
      return await fn();
    } catch (e) {
      failures.push(`${label}: ${(e as Error).message}`);
      console.error(`[export] FAILED ${label}: ${(e as Error).message}`);
    }
  };

  const clientList = (await save("clients.json", "/api/v1/clients.json")) as {
    clients: { slug: string; name: string; state: string }[];
  };
  const clients = clientList.clients;
  console.log(`[export] ${clients.length} clients -> ${dir}`);

  let workoutCount = 0;
  for (let i = 0; i < clients.length; i++) {
    const c = clients[i];
    await attempt(`${c.slug} profile`, () =>
      save(`clients/${c.slug}.profile.json`, `/api/v1/clients/${c.slug}.json`)
    );
    const w = (await attempt(`${c.slug} workouts`, () =>
      save(
        `clients/${c.slug}.workouts.json`,
        `/api/v1/clients/${c.slug}/workouts.json?start_date=${HISTORY_START}&end_date=${HISTORY_END}`
      )
    )) as { workouts?: unknown[] } | undefined;
    workoutCount += w?.workouts?.length ?? 0;
    console.log(`[export] client ${i + 1}/${clients.length} ${c.name} (${c.state}): ${w?.workouts?.length ?? "?"} workouts`);
  }

  const programList = (await save("programs.json", "/api/v1/programs.json")) as {
    programs: { id: number | string; name: string }[];
  };
  const programs = programList.programs;
  let programWorkoutCount = 0;
  for (let i = 0; i < programs.length; i++) {
    const p = programs[i];
    const w = (await attempt(`program ${p.id}`, () =>
      save(`programs/${p.id}.workouts.json`, `/api/v1/programs/${p.id}/workouts.json`)
    )) as { workouts?: unknown[] } | undefined;
    programWorkoutCount += w?.workouts?.length ?? 0;
    if ((i + 1) % 10 === 0 || i + 1 === programs.length) {
      console.log(`[export] programs ${i + 1}/${programs.length}`);
    }
  }

  const manifest = {
    exportedAt: new Date().toISOString(),
    historyRange: [HISTORY_START, HISTORY_END],
    clients: clients.length,
    clientWorkouts: workoutCount,
    programs: programs.length,
    programWorkouts: programWorkoutCount,
    failures,
    seconds: Math.round((Date.now() - started) / 1000),
  };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`[export] done: ${JSON.stringify(manifest)}`);
  return failures.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error("[export] UNCAUGHT", e);
    process.exit(2);
  }
);
