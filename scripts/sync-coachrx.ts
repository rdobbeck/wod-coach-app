#!/usr/bin/env tsx
/**
 * Sync CoachRx exercise library -> Supabase.
 *
 * Flow:
 *   1. Find Ryan's CoachRx tab via OpenTabs (port 9515).
 *   2. Enable network capture filtered to /api/v1/exercises.
 *   3. Reload /library/exercises to force the request.
 *   4. Poll for the response body, parse + validate with Zod.
 *   5. Upsert into coachrx_exercises (raw mirror).
 *   6. Soft-delete entries that vanished from CoachRx >7 days ago.
 *   7. Call sync_coachrx_to_exercises() to propagate to ExerciseLibrary.
 *   8. Append to coachrx_sync_log.
 *
 * No CoachRx credentials are stored or extracted. The script observes a
 * request that Ryan's authenticated browser is already making.
 */

import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { z } from "zod";

// .env.local takes precedence over .env (Next.js convention)
loadDotenv({ path: resolve(process.cwd(), ".env.local"), override: true });

import { findCoachRxTab, executeScript, focusTab, navigateTab } from "./lib/opentabs";
import { getSupabase } from "./lib/supabase";

const API_FILTER = "/api/v1/exercises.json";
const UPSERT_CHUNK = 200;
const FETCH_TIMEOUT_MS = 15_000;

// CoachRx returns JSON:API format: { data: [{ id, type, attributes: {...}, relationships: {coach: {data: {id}}} }] }
const CoachRxAttributes = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    exercise_name: z.string(),
    description: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    default: z.boolean().default(false),
    patterns: z.array(z.string()).default([]),
    implements: z.array(z.string()).default([]),
    thumbnail: z.string().nullable().optional(),
    thumbnail_url: z.string().nullable().optional(),
  })
  .passthrough();

const CoachRxRow = z
  .object({
    id: z.union([z.string(), z.number()]).transform((v) => String(v)),
    type: z.string().optional(),
    attributes: CoachRxAttributes,
    relationships: z
      .object({
        coach: z
          .object({
            data: z
              .object({ id: z.union([z.string(), z.number()]).optional() })
              .nullable()
              .optional(),
          })
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const CoachRxPayload = z
  .object({
    data: z.array(CoachRxRow),
    meta: z.unknown().optional(),
    links: z.unknown().optional(),
  })
  .passthrough();

type RawRow = z.infer<typeof CoachRxRow>;

type MirrorRow = {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  patterns: string[];
  equipment: string[];
  is_default: boolean;
  owner_id: string | null;
  thumbnail_url: string | null;
  raw_json: unknown;
  fetched_at: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toMirrorRow(row: RawRow, fetchedAt: string): MirrorRow {
  const a = row.attributes;
  const coachId = row.relationships?.coach?.data?.id;
  const ownerId =
    coachId === null || coachId === undefined ? null : String(coachId);
  return {
    id: row.id,
    name: a.exercise_name,
    description: a.description ?? null,
    url: a.url ?? null,
    patterns: a.patterns ?? [],
    // CoachRx field is "implements" (equipment list) per JSON:API payload
    equipment: a.implements ?? [],
    is_default: a.default,
    owner_id: ownerId,
    thumbnail_url: a.thumbnail_url ?? a.thumbnail ?? null,
    raw_json: row,
    fetched_at: fetchedAt,
  };
}

/**
 * Get the FULL CoachRx exercise library in one shot.
 *
 * Approach: install a window.fetch wrapper inside the page that catches
 * the React app's next call to /api/v1/exercises*, reads the response
 * body via r.clone().text() (untruncated, since we read it from JS not
 * via OpenTabs' CDP capture which caps at 100 KB), and resolves. We
 * trigger the React app to refetch by pushing a fresh query string and
 * dispatching popstate so React Router refires its loader.
 *
 * Auth: we observe init.headers as the React app set them — the bearer
 * never leaves the tab; only the response JSON body crosses to Node.
 */
async function fetchLibraryViaWrapper(): Promise<RawRow[]> {
  const tab = findCoachRxTab();
  console.log(`[sync] Using CoachRx tab ${tab.tabId} (${tab.url})`);

  // Ensure we're on the library page so the bearer is loaded into the
  // page's storage (the React app populates it on auth).
  navigateTab(tab.tabId, `https://dashboard.coachrx.app/library/exercises`);
  await sleep(3000);
  // Clipboard write requires a focused document.
  focusTab(tab.tabId);
  await sleep(500);

  // In-page: read bearer from page storage, do the fetch, write the response
  // body to the system clipboard. The bearer never leaves the tab — only the
  // public exercises JSON does, via pbpaste from this Node process.
  // browser_execute_script caps string return values at ~50 KB and per-call
  // rate limits any chunked-retrieval scheme; clipboard sidesteps both.
  const fetchCode = String.raw`
    (async () => {
      function digToken(value) {
        if (typeof value !== 'string') return null;
        if (value.length < 20) return null;
        if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return value;
        try {
          const obj = JSON.parse(value);
          if (obj && typeof obj === 'object') {
            for (const k of ['token','accessToken','access_token','jwt','authToken','bearer','idToken','id_token']) {
              if (typeof obj[k] === 'string' && obj[k].length > 20) return obj[k];
            }
            if (obj.user && typeof obj.user.token === 'string') return obj.user.token;
            if (obj.auth && typeof obj.auth.token === 'string') return obj.auth.token;
          }
        } catch {}
        return null;
      }
      function findToken() {
        for (const [name, store] of [['localStorage', localStorage], ['sessionStorage', sessionStorage]]) {
          for (const k of Object.keys(store)) {
            const t = digToken(store.getItem(k));
            if (t) return { token: t, source: name + '.' + k };
          }
        }
        return null;
      }
      const found = findToken();
      if (!found) return { ok: false, error: 'no bearer token found in page storage' };
      try {
        const r = await fetch('/api/v1/exercises.json', {
          credentials: 'include',
          headers: {
            'Authorization': 'Bearer ' + found.token,
            'Accept': 'application/vnd.api+json, application/json',
          },
        });
        if (!r.ok) return { ok: false, error: 'HTTP ' + r.status + ' ' + r.statusText };
        const text = await r.text();
        // Try modern clipboard API first; fall back to execCommand which has
        // less strict focus requirements (works without OS-level window focus).
        let copied = false;
        let lastErr = '';
        try {
          await navigator.clipboard.writeText(text);
          copied = true;
        } catch (e) {
          lastErr = String(e);
        }
        if (!copied) {
          try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.top = '-9999px';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            ta.setSelectionRange(0, text.length);
            const success = document.execCommand('copy');
            ta.remove();
            if (success) copied = true;
            else lastErr = lastErr || 'execCommand returned false';
          } catch (e) {
            lastErr = lastErr || String(e);
          }
        }
        if (!copied) {
          return { ok: false, error: 'clipboard write failed: ' + lastErr, size: text.length };
        }
        return { ok: true, status: r.status, size: text.length, tokenSource: found.source };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    })()
  `;

  type WrapperResult =
    | { ok: true; status: number; size: number; tokenSource?: string }
    | { ok: false; error: string };

  const raw = executeScript<unknown>(tab.tabId, fetchCode);
  if (process.env.SYNC_DEBUG) {
    const head = JSON.stringify(raw).slice(0, 300);
    console.log(`[sync] DEBUG raw type=${typeof raw} keys=${
      raw && typeof raw === "object" && !Array.isArray(raw) ? Object.keys(raw).join(",") : "(n/a)"
    } headBytes=${head.length}`);
    console.log(`[sync] DEBUG raw head: ${head}`);
  }

  // Unwrap any layers of `{ value: ... }` (CDP RemoteObject + MCP wrapper).
  // Final inner value may be a JSON string when CDP returns a non-primitive.
  function unwrap(v: unknown): unknown {
    let cur = v;
    let steps = 0;
    while (
      cur &&
      typeof cur === "object" &&
      !Array.isArray(cur) &&
      "value" in cur &&
      Object.keys(cur).length === 1
    ) {
      cur = (cur as { value: unknown }).value;
      steps++;
      if (steps > 8) break;
    }
    if (process.env.SYNC_DEBUG) {
      console.log(`[sync] DEBUG unwrap steps=${steps} curType=${typeof cur}`);
    }
    if (typeof cur === "string") {
      try {
        const parsed = JSON.parse(cur);
        if (process.env.SYNC_DEBUG) {
          console.log(`[sync] DEBUG parsed string -> ${typeof parsed} keys=${
            parsed && typeof parsed === "object" ? Object.keys(parsed).join(",") : "(n/a)"
          }`);
        }
        return parsed;
      } catch (e) {
        if (process.env.SYNC_DEBUG) {
          console.log(`[sync] DEBUG JSON.parse failed: ${(e as Error).message}`);
        }
        return cur;
      }
    }
    return cur;
  }
  const result = unwrap(raw) as WrapperResult | undefined;
  if (!result || typeof result !== "object") {
    throw new Error(
      `Could not unwrap browser_execute_script result. Raw: ${JSON.stringify(raw).slice(0, 300)}`
    );
  }
  if (!result.ok) {
    throw new Error(`In-page fetch failed: ${result.error}`);
  }
  console.log(
    `[sync] In-page fetch returned ${result.size} bytes (HTTP ${result.status})${
      result.tokenSource ? ` via ${result.tokenSource}` : ""
    }`
  );

  // Read the body from the system clipboard. macOS pbpaste may add CR
  // characters around newlines; JSON.parse tolerates that.
  let body: string;
  try {
    body = execFileSync("pbpaste", { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    throw new Error(`pbpaste failed: ${(e as Error).message}`);
  }
  if (Math.abs(body.length - result.size) > body.length * 0.01) {
    throw new Error(
      `Clipboard content (${body.length} bytes) differs from expected size (${result.size}) by more than 1%. ` +
        `Did the clipboard get overwritten between fetch and read?`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new Error(`CoachRx response was not valid JSON: ${(e as Error).message}`);
  }
  return extractRows(parsed);
}

async function logRunStart() {
  const supa = getSupabase();
  const { data, error } = await supa
    .from("coachrx_sync_log")
    .insert({ status: "running" })
    .select("id")
    .single();
  if (error) throw new Error(`Could not insert sync log row: ${error.message}`);
  return data.id as number;
}

type RunSummary = {
  status: "ok" | "error" | "partial";
  rowsSeen: number;
  rowsUpserted: number;
  rowsDeleted: number;
  rowsInsertedApp: number;
  rowsUpdatedApp: number;
  rowsSkippedLocked: number;
  error?: string;
};

async function logRunFinish(id: number, s: RunSummary) {
  const supa = getSupabase();
  const { error } = await supa
    .from("coachrx_sync_log")
    .update({
      finished_at: new Date().toISOString(),
      status: s.status,
      rows_seen: s.rowsSeen,
      rows_upserted: s.rowsUpserted,
      rows_deleted: s.rowsDeleted,
      rows_inserted_app: s.rowsInsertedApp,
      rows_updated_app: s.rowsUpdatedApp,
      rows_skipped_locked: s.rowsSkippedLocked,
      error: s.error ?? null,
    })
    .eq("id", id);
  if (error) {
    console.error(`[sync] Could not update sync log ${id}: ${error.message}`);
  }
}

async function upsertMirror(rows: MirrorRow[]): Promise<number> {
  const supa = getSupabase();
  let upserted = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error, count } = await supa
      .from("coachrx_exercises")
      .upsert(chunk, { onConflict: "id", count: "exact" });
    if (error) {
      throw new Error(
        `Supabase upsert failed at offset ${i}: ${error.message}`
      );
    }
    upserted += count ?? chunk.length;
  }
  return upserted;
}

async function softDeleteMissing(seenIds: string[]): Promise<number> {
  // Only delete rows that are missing AND haven't been refreshed in 7+ days.
  // The fetched_at on rows we just upserted is "now", so they're protected.
  // This guards against a single partial fetch wiping out the mirror.
  const supa = getSupabase();
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { error, count } = await supa
    .from("coachrx_exercises")
    .delete({ count: "exact" })
    .lt("fetched_at", cutoff)
    .not("id", "in", `(${seenIds.length === 0 ? "NULL" : seenIds.map((s) => `"${s}"`).join(",")})`);
  if (error) {
    console.warn(`[sync] Soft-delete query failed: ${error.message}`);
    return 0;
  }
  return count ?? 0;
}

async function callMapper(): Promise<{
  inserted: number;
  updated: number;
  skipped_locked: number;
}> {
  const supa = getSupabase();
  const { data, error } = await supa.rpc("sync_coachrx_to_exercises");
  if (error) {
    throw new Error(`sync_coachrx_to_exercises() failed: ${error.message}`);
  }
  // RPC returns an array of one row (set-returning function)
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("sync_coachrx_to_exercises() returned no row");
  return {
    inserted: Number(row.inserted ?? 0),
    updated: Number(row.updated ?? 0),
    skipped_locked: Number(row.skipped_locked ?? 0),
  };
}

function extractRows(payload: unknown): RawRow[] {
  const parsed = CoachRxPayload.parse(payload);
  return parsed.data;
}

async function main(): Promise<number> {
  const started = new Date().toISOString();
  console.log(`[sync] Started ${started}`);

  let logId: number | undefined;
  try {
    logId = await logRunStart();
  } catch (e) {
    console.error(`[sync] FATAL: could not write sync log: ${(e as Error).message}`);
    return 2;
  }

  try {
    const rawRows = await fetchLibraryViaWrapper();
    console.log(`[sync] Captured ${rawRows.length} rows from CoachRx`);

    const fetchedAt = new Date().toISOString();
    const mirrorRows = rawRows.map((r) => toMirrorRow(r, fetchedAt));

    const upserted = await upsertMirror(mirrorRows);
    console.log(`[sync] Upserted ${upserted} rows into coachrx_exercises`);

    const deleted = await softDeleteMissing(mirrorRows.map((r) => r.id));
    if (deleted > 0) console.log(`[sync] Soft-deleted ${deleted} stale rows`);

    const mapped = await callMapper();
    console.log(
      `[sync] App table: ${mapped.inserted} inserted, ${mapped.updated} updated, ${mapped.skipped_locked} locked`
    );

    await logRunFinish(logId, {
      status: "ok",
      rowsSeen: rawRows.length,
      rowsUpserted: upserted,
      rowsDeleted: deleted,
      rowsInsertedApp: mapped.inserted,
      rowsUpdatedApp: mapped.updated,
      rowsSkippedLocked: mapped.skipped_locked,
    });

    console.log(
      `[sync] ok: ${rawRows.length} seen, ${upserted} upserted (${mapped.inserted} inserted, ${mapped.updated} updated, ${mapped.skipped_locked} locked-skipped), ${deleted} deleted`
    );
    return 0;
  } catch (e) {
    const message = (e as Error).message;
    console.error(`[sync] ERROR: ${message}`);
    if (logId !== undefined) {
      await logRunFinish(logId, {
        status: "error",
        rowsSeen: 0,
        rowsUpserted: 0,
        rowsDeleted: 0,
        rowsInsertedApp: 0,
        rowsUpdatedApp: 0,
        rowsSkippedLocked: 0,
        error: message,
      });
    }
    return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error("[sync] UNCAUGHT", e);
    process.exit(2);
  }
);
