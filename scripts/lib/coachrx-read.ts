import { findCoachRxTab, executeScript } from "./opentabs";

/**
 * Read-only CoachRx API access for the pilot-client import.
 *
 * Authorized 2026-09-21 (Ryan): GET only, limited to programs, program workouts,
 * clients (list + profile) and client workouts. Same pattern as the exercise
 * sync: the bearer is read from page storage inside the tab and used for one
 * fetch; it is never stashed, returned, persisted or logged. Only the JSON body
 * leaves the tab, via window.__crxReadBody read back in slices.
 */
const ALLOWED: RegExp[] = [
  /^\/api\/v1\/programs(\.json)?(\?[^#]*)?$/,
  /^\/api\/v1\/programs\/\d+\/workouts(\.json)?(\?[^#]*)?$/,
  /^\/api\/v1\/clients(\.json)?(\?[^#]*)?$/,
  /^\/api\/v1\/clients\/[A-Za-z0-9_-]+(\.json)?(\?[^#]*)?$/,
  /^\/api\/v1\/clients\/[A-Za-z0-9_-]+\/workouts(\.json)?(\?[^#]*)?$/,
];

const READ_CHUNK = 16_000;
const READ_PAUSE_MS = 1_000;
const RATE_LIMIT_PAUSE_MS = 30_000;
const POLL_MS = 2_000;
const FETCH_TIMEOUT_MS = 120_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function unwrap(v: unknown): unknown {
  let cur = v;
  for (let i = 0; i < 8; i++) {
    if (cur && typeof cur === "object" && !Array.isArray(cur) && "value" in cur && Object.keys(cur).length === 1) {
      cur = (cur as { value: unknown }).value;
    } else break;
  }
  if (typeof cur === "string") {
    try {
      return JSON.parse(cur);
    } catch {
      return cur;
    }
  }
  return cur;
}

async function exec(code: string): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    try {
      return unwrap(executeScript<unknown>(findCoachRxTab().tabId, code));
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (!/rate limit/i.test(msg) || attempt === 3) throw e;
      console.warn(`[coachrx] Rate limited; waiting ${RATE_LIMIT_PAUSE_MS / 1000}s`);
      await sleep(RATE_LIMIT_PAUSE_MS);
    }
  }
}

export async function coachrxGet(path: string): Promise<{ status: number; body: unknown }> {
  if (!ALLOWED.some((re) => re.test(path))) {
    throw new Error(`coachrxGet: ${path} is outside the authorized read-only endpoints`);
  }
  // OpenTabs kills scripts after 10s, and client endpoints can take longer.
  // So the fetch is started without awaiting it; its outcome lands on
  // window.__crxReadState, which we poll below.
  const fetchCode = String.raw`
    window.__crxReadState = { done: false };
    (async () => {
      function digToken(value) {
        if (typeof value !== 'string' || value.length < 20) return null;
        if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return value;
        try {
          const obj = JSON.parse(value);
          if (obj && typeof obj === 'object') {
            for (const k of ['token','accessToken','access_token','jwt','authToken','bearer','idToken','id_token']) {
              if (typeof obj[k] === 'string' && obj[k].length > 20) return obj[k];
            }
          }
        } catch {}
        return null;
      }
      let token = null;
      for (const store of [localStorage, sessionStorage]) {
        for (const k of Object.keys(store)) { token = digToken(store.getItem(k)); if (token) break; }
        if (token) break;
      }
      if (!token) return { ok: false, error: 'no bearer token found in page storage' };
      try {
        const r = await fetch(${JSON.stringify(path)}, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.api+json, application/json' },
        });
        const text = await r.text();
        let sum = 0;
        for (let i = 0; i < text.length; i++) sum = (sum * 31 + text.charCodeAt(i)) >>> 0;
        window.__crxReadBody = text;
        return { ok: true, status: r.status, size: text.length, checksum: sum };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    })().then((res) => { window.__crxReadState = { done: true, ...res }; });
    true
  `;
  await exec(fetchCode);

  type ReadState =
    | { done: true; ok: true; status: number; size: number; checksum: number }
    | { done: true; ok: false; error: string }
    | { done: false };
  let res: ReadState = { done: false };
  for (const started = Date.now(); !res.done; ) {
    if (Date.now() - started > FETCH_TIMEOUT_MS) throw new Error(`coachrxGet ${path}: no response after ${FETCH_TIMEOUT_MS / 1000}s`);
    await sleep(POLL_MS);
    res = ((await exec("window.__crxReadState || { done: false }")) as ReadState) ?? { done: false };
  }
  if (!res.ok) throw new Error(`coachrxGet ${path}: ${res.error}`);

  const parts: string[] = [];
  for (let offset = 0; offset < res.size; offset += READ_CHUNK) {
    await sleep(READ_PAUSE_MS);
    const r = (await exec(
      `({ chunk: (window.__crxReadBody || '').slice(${offset}, ${offset + READ_CHUNK}) })`
    )) as { chunk?: unknown };
    const expected = Math.min(READ_CHUNK, res.size - offset);
    if (typeof r?.chunk !== "string" || r.chunk.length !== expected) {
      throw new Error(`coachrxGet ${path}: chunk at ${offset} truncated`);
    }
    parts.push(r.chunk);
  }
  await exec("delete window.__crxReadBody; delete window.__crxReadState; true").catch(() => undefined);

  const text = parts.join("");
  let sum = 0;
  for (let i = 0; i < text.length; i++) sum = (sum * 31 + text.charCodeAt(i)) >>> 0;
  if (sum !== res.checksum) throw new Error(`coachrxGet ${path}: checksum mismatch`);

  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body };
}
