// Minimal Paylo REST client for the MCP tools. Guardrails live here:
// - only a SECRET key (sk_) is accepted — publishable keys can't reach
//   the account endpoints the tools need;
// - live keys are refused unless PAYLO_ALLOW_LIVE=1, and write tools are
//   test-mode only regardless (see assertCanWrite);
// - no tool can refund, cancel or delete anything.

import { API_URL } from "./knowledge.js";

export class PayloError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export interface ApiConfig {
  key: string | undefined;
  baseUrl: string;
  allowLive: boolean;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    key: env.PAYLO_SECRET_KEY?.trim() || undefined,
    baseUrl: (env.PAYLO_API_URL?.trim() || API_URL).replace(/\/+$/, ""),
    allowLive: env.PAYLO_ALLOW_LIVE === "1",
  };
}

export type KeyMode = "test" | "live";

export function keyMode(key: string): KeyMode | null {
  if (key.startsWith("sk_test_")) return "test";
  if (key.startsWith("sk_live_")) return "live";
  return null;
}

const SETUP_HINT =
  "Set PAYLO_SECRET_KEY to your sk_test_… key (Paylo dashboard → Settings → API keys) in this MCP server's environment, e.g. `claude mcp add paylo -e PAYLO_SECRET_KEY=sk_test_… -- npx -y github:ssid131133-star/paylo-mcp`.";

// Validates the configured key and returns its mode.
export function requireKey(cfg: ApiConfig): { key: string; mode: KeyMode } {
  if (!cfg.key) throw new PayloError(`No Paylo key configured. ${SETUP_HINT}`);
  if (cfg.key.startsWith("pk_")) {
    throw new PayloError(
      `PAYLO_SECRET_KEY holds a publishable key (pk_…). These tools need the secret key (sk_test_…) — publishable keys only reach the SDK endpoints. ${SETUP_HINT}`,
    );
  }
  const mode = keyMode(cfg.key);
  if (!mode) throw new PayloError(`PAYLO_SECRET_KEY doesn't look like a Paylo secret key (sk_test_… / sk_live_…). ${SETUP_HINT}`);
  if (mode === "live" && !cfg.allowLive) {
    throw new PayloError(
      "PAYLO_SECRET_KEY is a LIVE key. This MCP server works in test mode by default — use your sk_test_ key, or set PAYLO_ALLOW_LIVE=1 to allow read-only tools on live data.",
    );
  }
  return { key: cfg.key, mode };
}

// Tools that create or change things never run against live data.
export function assertCanWrite(mode: KeyMode) {
  if (mode !== "test") {
    throw new PayloError("This tool only runs with a test key (sk_test_…) — it never changes live data.");
  }
}

export async function payloRequest<T = unknown>(
  cfg: ApiConfig,
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
  opts: { auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.auth !== false) headers.Authorization = `Bearer ${requireKey(cfg).key}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new PayloError(`Couldn't reach the Paylo API at ${cfg.baseUrl}: ${(err as Error).message}`);
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON body (proxy error page…)
  }
  if (!res.ok) {
    const apiError = (json as { error?: string; details?: unknown } | null)?.error ?? text.slice(0, 300);
    const details = (json as { details?: unknown } | null)?.details;
    throw new PayloError(
      `Paylo API ${method} ${path} → ${res.status}: ${apiError}${details ? ` ${JSON.stringify(details)}` : ""}`,
      res.status,
    );
  }
  return json as T;
}
