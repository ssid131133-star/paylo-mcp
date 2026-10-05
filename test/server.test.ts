import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { TOPIC_IDS, searchDocs } from "../src/knowledge.js";
import type { ApiConfig } from "../src/api.js";

async function connect(cfg: Partial<ApiConfig> = {}) {
  const server = createServer({ key: undefined, baseUrl: "http://127.0.0.1:9", allowLive: false, ...cfg });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientT);
  return client;
}

const textOf = (r: unknown) => ((r as { content: { text: string }[] }).content ?? []).map((c) => c.text).join("\n");

describe("tool catalog", () => {
  it("exposes the knowledge and account tools with descriptions", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "paylo_check_setup",
      "paylo_create_plan",
      "paylo_create_test_checkout",
      "paylo_customer_status",
      "paylo_docs",
      "paylo_get_started",
      "paylo_list_plans",
      "paylo_list_subscriptions",
      "paylo_recent_webhook_deliveries",
      "paylo_resolve_paywall",
      "paylo_search_docs",
      "paylo_set_redirect_urls",
      "paylo_set_webhook_url",
      "paylo_webhook_handler",
    ]);
    for (const t of tools) expect(t.description?.length ?? 0).toBeGreaterThan(30);
  });

  it("gives the assistant usage instructions", async () => {
    const client = await connect();
    expect(client.getInstructions()).toMatch(/publishable key/);
  });
});

describe("knowledge tools (no key)", () => {
  it("get_started covers prerequisites, keys and the platform", async () => {
    const client = await connect();
    const flutter = textOf(await client.callTool({ name: "paylo_get_started", arguments: { platform: "flutter" } }));
    expect(flutter).toMatch(/Redirect URLs/);
    expect(flutter).toMatch(/Paylo\.configure\('pk_test_/);
    expect(flutter).toMatch(/paylo-flutter\.git/);
    expect(flutter).toMatch(/NEVER put it in an app/);
    const web = textOf(await client.callTool({ name: "paylo_get_started", arguments: { platform: "web" } }));
    expect(web).toMatch(/PAYLO_SECRET_KEY/);
    expect(web).toMatch(/"Content-Type": "application\/json"/);
  });

  it("every docs topic renders", async () => {
    const client = await connect();
    for (const topic of TOPIC_IDS) {
      const res = await client.callTool({ name: "paylo_docs", arguments: { topic } });
      expect(res.isError).toBeFalsy();
      expect(textOf(res).length).toBeGreaterThan(200);
    }
  });

  it("rejects unknown topics", async () => {
    const client = await connect();
    const res = await client.callTool({ name: "paylo_docs", arguments: { topic: "nope" } });
    expect(res.isError).toBe(true);
  });

  it("search finds the redirect-URL requirement and the signature scheme", () => {
    expect(searchDocs("success_url required")[0].excerpt).toMatch(/success_url/);
    expect(searchDocs("webhook signature")[0].topic).toMatch(/webhooks|troubleshooting/);
  });

  it("webhook handlers verify the HMAC and filter test events", async () => {
    const client = await connect();
    for (const language of ["node", "python", "go", "php", "ruby"]) {
      const text = textOf(await client.callTool({ name: "paylo_webhook_handler", arguments: { language } }));
      expect(text, language).toMatch(/sha256/i);
      expect(text, language).toMatch(/mode/);
      expect(text, language).toMatch(/subscription\.activated/);
    }
  });
});

describe("account tools — guardrails", () => {
  it("explain how to configure the key when none is set", async () => {
    const client = await connect();
    const res = await client.callTool({ name: "paylo_check_setup", arguments: {} });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/PAYLO_SECRET_KEY/);
    expect(textOf(res)).toMatch(/claude mcp add paylo/);
  });

  it("refuse publishable keys", async () => {
    const client = await connect({ key: "pk_test_" + "a".repeat(64) });
    const res = await client.callTool({ name: "paylo_list_plans", arguments: {} });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/publishable key/);
  });

  it("refuse live keys by default", async () => {
    const client = await connect({ key: "sk_live_" + "a".repeat(64) });
    const res = await client.callTool({ name: "paylo_list_plans", arguments: {} });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/LIVE key/);
  });

  it("never write with a live key, even when live reads are allowed", async () => {
    const client = await connect({ key: "sk_live_" + "a".repeat(64), allowLive: true });
    const res = await client.callTool({
      name: "paylo_create_plan",
      arguments: { slug: "pro", name: "Pro", amount: 999 },
    });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/test key/);
  });

  it("report an unreachable API clearly", async () => {
    const client = await connect({ key: "sk_test_" + "a".repeat(64) });
    const res = await client.callTool({ name: "paylo_list_plans", arguments: {} });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/Couldn't reach the Paylo API/);
  });
});
