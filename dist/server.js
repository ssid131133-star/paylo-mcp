import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { assertCanWrite, configFromEnv, payloRequest, PayloError, requireKey, } from "./api.js";
import { DOCS_URL, TOPIC_IDS, integrationGuide, renderTopic, searchDocs, webhookHandler, } from "./knowledge.js";
export const VERSION = "0.1.0";
const INSTRUCTIONS = `Paylo is payment infrastructure for apps (subscriptions, lifetime and one-time purchases, remote native paywalls) with a Paylo-hosted Stripe checkout.
When helping a developer integrate Paylo:
1. Call paylo_get_started with their platform (flutter, swift, kotlin, web) and follow it — it includes the required dashboard setup.
2. If PAYLO_SECRET_KEY is configured, call paylo_check_setup to see what's missing on their account (redirect URLs, plans, published paywall) and fix test-mode setup with the write tools.
3. Apps only ever embed the publishable key (pk_…); the secret key (sk_…) stays on servers. Never write a secret key into app or front-end code.
4. Prefer paylo_docs / paylo_search_docs over guessing endpoints, fields or SDK method names.
Write tools only run in test mode; nothing here can refund, cancel or delete.`;
const ok = (text) => ({ content: [{ type: "text", text }] });
const fail = (err) => ({
    content: [{ type: "text", text: err instanceof PayloError ? err.message : `Unexpected error: ${err.message}` }],
    isError: true,
});
const json = (value) => "```json\n" + JSON.stringify(value, null, 2) + "\n```";
async function run(fn) {
    try {
        return ok(await fn());
    }
    catch (err) {
        return fail(err);
    }
}
const money = (cents, currency) => `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
export function createServer(cfg = configFromEnv()) {
    const server = new McpServer({ name: "paylo", version: VERSION }, { instructions: INSTRUCTIONS });
    // ── Knowledge (no key needed) ───────────────────────────────────────────
    server.registerTool("paylo_get_started", {
        title: "Paylo integration guide",
        description: "Step-by-step guide to integrate Paylo payments on a platform: required dashboard setup, keys, install, code, subscriptions API and webhooks. Start here.",
        inputSchema: {
            platform: z.enum(["flutter", "swift", "kotlin", "web"]).describe("The app's platform. Use 'web' for any server-rendered or SPA web app."),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    }, async ({ platform }) => run(() => integrationGuide(platform)));
    server.registerTool("paylo_docs", {
        title: "Paylo docs topic",
        description: `Read one Paylo documentation topic. Topics: ${TOPIC_IDS.join(", ")}.`,
        inputSchema: { topic: z.enum(TOPIC_IDS) },
        annotations: { readOnlyHint: true, openWorldHint: false },
    }, async ({ topic }) => run(() => renderTopic(topic)));
    server.registerTool("paylo_search_docs", {
        title: "Search Paylo docs",
        description: "Keyword search across the Paylo docs (endpoints, fields, errors, SDK methods). Returns the most relevant passages.",
        inputSchema: { query: z.string().min(2).describe("e.g. 'offer token', 'webhook signature', 'success_url required'") },
        annotations: { readOnlyHint: true, openWorldHint: false },
    }, async ({ query }) => run(() => {
        const hits = searchDocs(query);
        if (!hits.length)
            return `No match for "${query}". Topics: ${TOPIC_IDS.join(", ")} (paylo_docs), or ${DOCS_URL}.`;
        return hits.map((h) => `### ${h.title} (topic: ${h.topic})\n\n${h.excerpt}`).join("\n\n---\n\n");
    }));
    server.registerTool("paylo_webhook_handler", {
        title: "Webhook handler code",
        description: "Ready-to-paste Paylo webhook endpoint with HMAC signature verification and test/live mode filtering.",
        inputSchema: { language: z.enum(["node", "python", "go", "php", "ruby"]) },
        annotations: { readOnlyHint: true, openWorldHint: false },
    }, async ({ language }) => run(() => webhookHandler(language)));
    // ── Account (needs PAYLO_SECRET_KEY) ────────────────────────────────────
    server.registerTool("paylo_check_setup", {
        title: "Check Paylo account setup",
        description: "Checks the account behind PAYLO_SECRET_KEY: mode, Developer ID, publishable key, default redirect URLs (required for SDK checkouts), plans, published paywall, webhook URL — and lists what's missing.",
        inputSchema: {},
        annotations: { readOnlyHint: true, openWorldHint: true },
    }, async () => run(async () => {
        const { mode } = requireKey(cfg);
        const [me, plans, paywalls] = await Promise.all([
            payloRequest(cfg, "GET", "/v1/developers/me"),
            payloRequest(cfg, "GET", "/v1/plans"),
            payloRequest(cfg, "GET", "/v1/paywalls"),
        ]);
        const todo = [];
        const lines = [`# Paylo setup — ${mode} mode`, ""];
        const publishable = mode === "live" ? me.key_prefix_live : me.key_prefix;
        lines.push(`- Account: ${me.email} · Developer ID \`${me.id}\` (Swift/Kotlin SDKs need it)`);
        lines.push(`- Publishable key for the app: ${publishable ? `\`${publishable}…\` (full key shown once in Settings → API keys)` : "❌ not generated"}`);
        if (!publishable)
            todo.push(`Generate the ${mode} publishable key in Settings → API keys.`);
        const redirectsOk = !!me.default_success_url && !!me.default_cancel_url;
        lines.push(redirectsOk
            ? `- ✅ Default redirect URLs: ${me.default_success_url} / ${me.default_cancel_url}`
            : "- ❌ Default redirect URLs missing — SDK checkouts fail with 400 until they're set");
        if (!redirectsOk)
            todo.push("Set default Success/Cancel URLs (paylo_set_redirect_urls, or Settings → Redirect URLs).");
        if (plans.plans.length) {
            lines.push(`- ✅ ${plans.plans.length} active plan(s) in ${mode} mode:`);
            for (const p of plans.plans) {
                lines.push(`  - \`${p.slug ?? p.id}\` — ${p.name}, ${money(p.amount, p.currency)} ${p.interval}` +
                    (p.trial_days ? `, ${p.trial_days}-day trial` : "") +
                    (p.entitlements.length ? `, entitlements [${p.entitlements.join(", ")}]` : ", ⚠️ no entitlements"));
            }
        }
        else {
            lines.push(`- ❌ No active plan in ${mode} mode`);
            todo.push("Create at least one plan (paylo_create_plan, or Dashboard → Payments).");
        }
        const published = paywalls.paywalls.find((p) => p.published);
        if (published) {
            const slugs = published.config.plan_slugs ?? [];
            const known = new Set(plans.plans.map((p) => p.slug));
            const missing = slugs.filter((s) => !known.has(s));
            lines.push(`- ✅ Published paywall: "${published.name}" showing [${slugs.join(", ") || "no plans"}]`);
            if (!slugs.length)
                todo.push(`Add plans to the published paywall "${published.name}".`);
            if (missing.length) {
                lines.push(`  - ⚠️ slugs with no active ${mode} plan: ${missing.join(", ")} — they won't be shown`);
                todo.push(`Create ${mode} plans with slugs ${missing.join(", ")} or change the paywall's plans.`);
            }
        }
        else {
            lines.push(`- ${paywalls.paywalls.length ? "⚠️ Paywalls exist but none is published" : "⚠️ No paywall yet"} (needed for PayloPaywall.showIfNeeded without targeting rules)`);
            todo.push("Design and publish a paywall in Dashboard → Paywalls (if the app uses paywalls).");
        }
        lines.push(me.webhook_url ? `- ✅ Webhook URL: ${me.webhook_url}` : "- ➖ No webhook URL (optional — needed only if your server reacts to payments)");
        lines.push("", todo.length ? "## To do\n" + todo.map((t, i) => `${i + 1}. ${t}`).join("\n") : "Everything required is set up. Test with card 4242 4242 4242 4242.");
        return lines.join("\n");
    }));
    server.registerTool("paylo_list_plans", {
        title: "List plans",
        description: "Active plans in the key's mode (slug, price, interval, trial, entitlements).",
        inputSchema: {},
        annotations: { readOnlyHint: true, openWorldHint: true },
    }, async () => run(async () => json((await payloRequest(cfg, "GET", "/v1/plans")).plans)));
    server.registerTool("paylo_create_plan", {
        title: "Create a plan (test mode)",
        description: "Creates a pricing plan in TEST mode. Plans can't be edited afterwards and a slug stays reserved even after deletion — confirm the details with the developer first.",
        inputSchema: {
            slug: z.string().regex(/^[a-z0-9_-]+$/).max(100).describe("Stable id used in code, e.g. pro_monthly"),
            name: z.string().min(1).max(200),
            amount: z.number().int().min(50).describe("Price in cents per period, e.g. 999 = 9.99"),
            currency: z.enum(["eur", "usd", "gbp"]).default("eur"),
            interval: z.enum(["daily", "weekly", "monthly", "yearly", "one_time"]).default("monthly").describe("one_time = lifetime purchase"),
            trial_days: z.number().int().min(1).max(365).optional().describe("Free trial, recurring plans only"),
            entitlements: z.array(z.string().regex(/^[a-z0-9_.-]+$/i)).max(20).optional().describe("Feature keys the plan unlocks, e.g. ['pro']"),
            description: z.string().max(1000).optional(),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async (args) => run(async () => {
        assertCanWrite(requireKey(cfg).mode);
        const plan = await payloRequest(cfg, "POST", "/v1/plans", args);
        return `Plan created in test mode:\n${json(plan)}\nUse the slug in code: subscribe(planId: '${args.slug}').`;
    }));
    server.registerTool("paylo_set_redirect_urls", {
        title: "Set default redirect URLs",
        description: "Sets where customers land after checkout (success) or when they back out (cancel). Required for SDK checkouts. Accepts web URLs or app deep links (myapp://paylo/success). Account-wide setting; runs only with a test key.",
        inputSchema: {
            success_url: z.string().min(3).max(2000),
            cancel_url: z.string().min(3).max(2000),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async ({ success_url, cancel_url }) => run(async () => {
        assertCanWrite(requireKey(cfg).mode);
        await payloRequest(cfg, "PATCH", "/v1/developers/me/redirects", {
            default_success_url: success_url,
            default_cancel_url: cancel_url,
        });
        return `Default redirect URLs set:\n- success: ${success_url}\n- cancel: ${cancel_url}`;
    }));
    server.registerTool("paylo_set_webhook_url", {
        title: "Set webhook URL",
        description: "Sets the URL Paylo POSTs signed events to (http/https, publicly reachable). Account-wide; runs only with a test key. The signing secret is shown in Settings → Webhook endpoint.",
        inputSchema: { url: z.string().url().max(2000) },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async ({ url }) => run(async () => {
        assertCanWrite(requireKey(cfg).mode);
        await payloRequest(cfg, "PATCH", "/v1/developers/me/webhook", { webhook_url: url });
        return `Webhook URL set to ${url}. Copy the whsec_ signing secret from Dashboard → Settings → Webhook endpoint (Reveal) into your server's env, then use paylo_webhook_handler for the handler code.`;
    }));
    server.registerTool("paylo_create_test_checkout", {
        title: "Create a test checkout",
        description: "Creates a TEST-mode subscription checkout for a plan and returns its URL — open it and pay with card 4242 4242 4242 4242 to test the whole flow end to end.",
        inputSchema: {
            plan_id: z.string().min(1).describe("Plan slug or UUID"),
            customer_id: z.string().min(1).max(500).describe("The id your app uses for this user"),
            customer_email: z.string().email().optional(),
            success_url: z.string().optional().describe("Defaults to the account's Success URL"),
            cancel_url: z.string().optional().describe("Defaults to the account's Cancel URL"),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async (args) => run(async () => {
        assertCanWrite(requireKey(cfg).mode);
        const res = await payloRequest(cfg, "POST", "/v1/subscriptions", args);
        return `Test checkout created (subscription ${res.id}, status ${res.status}).\nOpen: ${res.url}\nPay with 4242 4242 4242 4242, any future date, any CVC — then check paylo_customer_status for "${args.customer_id}".`;
    }));
    server.registerTool("paylo_customer_status", {
        title: "Customer access status",
        description: "What the app sees for a customer: has_active_subscription, entitlements, trial, active plan, scheduled downgrade, subscriptions.",
        inputSchema: { customer_id: z.string().min(1).max(500) },
        annotations: { readOnlyHint: true, openWorldHint: true },
    }, async ({ customer_id }) => run(async () => json(await payloRequest(cfg, "GET", `/v1/customers/${encodeURIComponent(customer_id)}/status`))));
    server.registerTool("paylo_list_subscriptions", {
        title: "List subscriptions",
        description: "Latest 100 subscriptions in the key's mode, optionally filtered by status or customer id.",
        inputSchema: {
            status: z.enum(["pending", "trialing", "active", "cancelling", "cancelled", "past_due", "refunded", "expired"]).optional(),
            search: z.string().max(200).optional().describe("Part of a customer id"),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
    }, async ({ status, search }) => run(async () => {
        const q = new URLSearchParams();
        if (status)
            q.set("status", status);
        if (search)
            q.set("search", search);
        const res = await payloRequest(cfg, "GET", `/v1/subscriptions${q.size ? `?${q}` : ""}`);
        return json(res.subscriptions);
    }));
    server.registerTool("paylo_recent_webhook_deliveries", {
        title: "Recent webhook deliveries",
        description: "Last 100 webhook deliveries (event, URL, status, HTTP code, error, attempts) — to debug a webhook endpoint.",
        inputSchema: {},
        annotations: { readOnlyHint: true, openWorldHint: true },
    }, async () => run(async () => json((await payloRequest(cfg, "GET", "/v1/developers/me/webhook-logs")).logs)));
    server.registerTool("paylo_resolve_paywall", {
        title: "Debug paywall targeting",
        description: "Asks Paylo which paywall a customer would get, exactly as the SDK does, and why (reason: rule_matched, published_fallback, audience_no_match, frequency_capped, already_subscribed, no_match). Registers the customer as 'seen' if new.",
        inputSchema: {
            customer_id: z.string().min(1).max(500),
            placement: z.string().max(100).optional(),
            platform: z.enum(["ios", "android", "web"]).optional(),
            locale: z.string().max(20).optional(),
            app_version: z.string().max(20).optional(),
            attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async (args) => run(async () => {
        const me = await payloRequest(cfg, "GET", "/v1/developers/me");
        const res = await payloRequest(cfg, "POST", `/v1/public/${me.id}/paywall/resolve`, args);
        const summary = res.paywall
            ? `Shows "${res.paywall.name}" (${res.paywall.plans.map((p) => p.slug).join(", ") || "no plans"}) — reason: ${res.reason}${res.rule_id ? `, rule ${res.rule_id}` : ""}${res.offer ? ", with an offer" : ""}`
            : `Shows nothing — reason: ${res.reason}`;
        return `${summary}\n${json(res)}`;
    }));
    return server;
}
