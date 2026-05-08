import { execFileSync } from "node:child_process";

/**
 * OpenTabs client — shells out to the `opentabs tool call` CLI.
 *
 * Why CLI rather than HTTP: OpenTabs is an MCP server (JSON-RPC over
 * Streamable HTTP), not a REST API. The CLI handles transport, auth, and
 * result framing. Subprocess overhead is negligible for our few-call flow.
 */

type Tab = {
  id: number;
  title?: string;
  url?: string;
  active?: boolean;
  windowId?: number;
  groupId?: number;
  connectionId?: string;
};

type CapturedRequest = {
  url?: string;
  method?: string;
  status?: number;
  statusCode?: number;
  responseBody?: string;
  body?: string;
  response?: { body?: string; status?: number };
  request?: { url?: string };
};

const OPENTABS_BIN = process.env.OPENTABS_BIN ?? "opentabs";

function call<T>(name: string, args: Record<string, unknown> = {}): T {
  const payload = JSON.stringify(args);
  const stdout = execFileSync(OPENTABS_BIN, ["tool", "call", name, payload], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024, // CoachRx library payload is ~100KB but be generous
  });
  // CLI prints JSON for tool results. Strip any leading/trailing whitespace.
  const trimmed = stdout.trim();
  if (trimmed.length === 0) return undefined as T;
  try {
    return JSON.parse(trimmed) as T;
  } catch (e) {
    throw new Error(
      `OpenTabs ${name}: could not parse CLI output as JSON: ${(e as Error).message}\n--- output ---\n${trimmed.slice(0, 500)}`
    );
  }
}

export function listTabs(): Tab[] {
  return call<Tab[]>("browser_list_tabs");
}

export function navigateTab(tabId: number, url: string): void {
  call<unknown>("browser_navigate_tab", { tabId, url });
}

export function focusTab(tabId: number): void {
  call<unknown>("browser_focus_tab", { tabId });
}

export function enableNetworkCapture(tabId: number, urlFilter: string): void {
  call<unknown>("browser_enable_network_capture", { tabId, urlFilter });
}

export function disableNetworkCapture(tabId: number): void {
  try {
    call<unknown>("browser_disable_network_capture", { tabId });
  } catch (e) {
    // Non-fatal — log and move on.
    console.warn("[opentabs] disable_network_capture failed:", (e as Error).message);
  }
}

export function getNetworkRequests(tabId: number, urlFilter?: string): CapturedRequest[] {
  const args: Record<string, unknown> = { tabId };
  if (urlFilter) args.urlFilter = urlFilter;
  const out = call<CapturedRequest[] | { requests?: CapturedRequest[] }>(
    "browser_get_network_requests",
    args
  );
  if (Array.isArray(out)) return out;
  return out.requests ?? [];
}

/**
 * Run JS in the page main world and return its JSON-serializable result.
 * The browser's session cookies/headers apply, so authenticated `fetch()`
 * calls work transparently. No CDP body-size truncation.
 */
export function executeScript<T = unknown>(tabId: number, code: string): T {
  return call<T>("browser_execute_script", { tabId, code });
}

export type CoachRxTab = { tabId: number; url: string };

export function findCoachRxTab(): CoachRxTab {
  const tabs = listTabs();
  // Prefer a tab already on /library/exercises if one exists.
  const onLibrary = tabs.find((t) =>
    (t.url ?? "").includes("dashboard.coachrx.app/library/exercises")
  );
  // Otherwise prefer the active CoachRx tab.
  const active = tabs.find(
    (t) => t.active && (t.url ?? "").includes("dashboard.coachrx.app")
  );
  // Otherwise any CoachRx tab.
  const any = tabs.find((t) => (t.url ?? "").includes("dashboard.coachrx.app"));

  const match = onLibrary ?? active ?? any;
  if (!match) {
    throw new Error(
      "No CoachRx tab found in OpenTabs. Open https://dashboard.coachrx.app/library/exercises in the OpenTabs Chrome profile and ensure you're logged in."
    );
  }
  return { tabId: match.id, url: match.url ?? "" };
}

export function pickResponseBody(req: CapturedRequest): string | undefined {
  return req.response?.body ?? req.responseBody ?? req.body;
}

export function pickStatus(req: CapturedRequest): number | undefined {
  return req.response?.status ?? req.status ?? req.statusCode;
}

export function pickUrl(req: CapturedRequest): string {
  return req.request?.url ?? req.url ?? "";
}
