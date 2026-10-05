# Paylo MCP server

Lets AI coding assistants (Claude Code, Cursor, Claude Desktop, VS Code…) integrate [Paylo](https://paylo-six.vercel.app) payments correctly: accurate docs and code for your platform, a setup check of your Paylo account, and safe **test-mode** actions (create plans, set redirect URLs, open a test checkout, debug paywall targeting).

## Install

You need Node.js 18+ and, for the account tools, your **test secret key** (`sk_test_…`, Paylo dashboard → Settings → API keys). The docs tools work without a key.

**Claude Code**

```bash
claude mcp add paylo -e PAYLO_SECRET_KEY=sk_test_... -- npx -y github:ssid131133-star/paylo-mcp
```

**Cursor** — `.cursor/mcp.json` (or Settings → MCP):

```json
{
  "mcpServers": {
    "paylo": {
      "command": "npx",
      "args": ["-y", "github:ssid131133-star/paylo-mcp"],
      "env": { "PAYLO_SECRET_KEY": "sk_test_..." }
    }
  }
}
```

**Claude Desktop** — same block in `claude_desktop_config.json`. **VS Code** — same block under `"servers"` in `.vscode/mcp.json` with `"type": "stdio"`.

Keep the key out of version control: prefer your MCP client's user-level config, or an environment variable.

Then ask your assistant something like *"Add Paylo subscriptions to my Flutter app"* or *"Why doesn't user_42 see the paywall?"*.

## Tools

| Tool | Needs key | What it does |
|---|---|---|
| `paylo_get_started` | — | Full integration guide for `flutter`, `swift`, `kotlin` or `web`: dashboard setup, keys, install, code, API, webhooks |
| `paylo_docs` | — | One docs topic (overview, keys, prerequisites, flutter, swift, kotlin, web, subscriptions, one_time, webhooks, paywalls, targeting, troubleshooting, api_reference) |
| `paylo_search_docs` | — | Keyword search across the docs |
| `paylo_webhook_handler` | — | Webhook endpoint with signature verification — node, python, go, php, ruby |
| `paylo_check_setup` | ✓ | What's configured and what's missing: redirect URLs, plans, published paywall, webhook, Developer ID |
| `paylo_list_plans` | ✓ | Active plans in the key's mode |
| `paylo_create_plan` | ✓ test | Create a plan |
| `paylo_set_redirect_urls` | ✓ test | Default success/cancel URLs (required for SDK checkouts) |
| `paylo_set_webhook_url` | ✓ test | Webhook endpoint URL |
| `paylo_create_test_checkout` | ✓ test | A test checkout URL to pay with 4242 4242 4242 4242 |
| `paylo_customer_status` | ✓ | What the app sees for a customer (access, entitlements, trial…) |
| `paylo_list_subscriptions` | ✓ | Latest subscriptions, filter by status / customer |
| `paylo_recent_webhook_deliveries` | ✓ | Webhook delivery log, to debug your endpoint |
| `paylo_resolve_paywall` | ✓ | Which paywall a customer gets, and why |

## Safety

- Only secret keys are accepted; publishable `pk_` keys are refused with an explanation.
- Live keys (`sk_live_`) are refused unless you set `PAYLO_ALLOW_LIVE=1`, which enables the **read-only** tools on live data. Tools that create or change something always require a test key.
- No tool can refund, cancel, or delete anything.

## Environment

| Variable | Default | |
|---|---|---|
| `PAYLO_SECRET_KEY` | — | `sk_test_…` (account tools) |
| `PAYLO_API_URL` | `https://paylo-production.up.railway.app` | Staging / self-hosted API |
| `PAYLO_ALLOW_LIVE` | unset | `1` = allow read-only tools with a live key |
