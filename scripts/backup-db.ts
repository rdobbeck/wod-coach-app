#!/usr/bin/env tsx
/**
 * Nightly database backup: every table in the public schema -> one gzipped JSON
 * file in backups/db/ (gitignored). Keeps the newest KEEP files.
 *
 *   npm run backup:db
 *
 * Supabase's free plan has no point-in-time restore, so this is the safety net.
 * Restoring is a manual job: read the file and re-insert rows (ask Claude).
 */
import { config as loadDotenv } from "dotenv";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { PrismaClient } from "@prisma/client";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), override: true });

const DIR = "backups/db";
const KEEP = 14;
const prisma = new PrismaClient();

// BigInt (sync log ids) and Decimal-like values need a JSON-safe form.
const replacer = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

async function main() {
  mkdirSync(DIR, { recursive: true });
  const started = Date.now();
  const tables: { table_name: string }[] = await prisma.$queryRawUnsafe(
    `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`
  );
  const dump: Record<string, unknown[]> = {};
  let rows = 0;
  for (const { table_name } of tables) {
    dump[table_name] = await prisma.$queryRawUnsafe(`select * from public."${table_name}"`);
    rows += dump[table_name].length;
  }
  const stamp = new Date().toISOString().replace(/[:]/g, "-").slice(0, 19);
  const file = join(DIR, `wod-coach-${stamp}.json.gz`);
  const gz = gzipSync(JSON.stringify({ takenAt: new Date().toISOString(), tables: dump }, replacer));
  writeFileSync(file, gz);

  const old = readdirSync(DIR).filter((f) => f.startsWith("wod-coach-") && f.endsWith(".json.gz")).sort().reverse().slice(KEEP);
  for (const f of old) rmSync(join(DIR, f));

  console.log(
    `[backup] ${new Date().toISOString()} ${tables.length} tables, ${rows} rows -> ${file} (${(gz.length / 1024).toFixed(0)} KB, ${((Date.now() - started) / 1000).toFixed(1)}s); pruned ${old.length}`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(`[backup] FAILED ${new Date().toISOString()}: ${(e as Error).message}`);
    await prisma.$disconnect();
    process.exit(1);
  });
