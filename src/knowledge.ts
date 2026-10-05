// Paylo integration knowledge served to AI assistants. Mirrors the public
// docs at https://paylo-six.vercel.app/docs — keep both in sync when the
// API or the SDKs change.

export const DOCS_URL = "https://paylo-six.vercel.app/docs";
export const API_URL = "https://paylo-production.up.railway.app";

export const TOPICS = {
  overview: {
    title: "What Paylo is and how a payment flows",
    body: `Paylo is payment infrastructure for apps (mobile first, web supported): subscriptions, one-time and lifetime purchases, remotely configured native paywalls — an alternative to app store billing. Customers pay on a Paylo-hosted checkout page (Stripe Embedded Checkout) branded with the developer's name, logo and color.

Flow:
1. Your app (SDK) or server calls the Paylo API → a checkout is created, you get a \`url\`.
2. The customer opens \`url\` in a browser and pays (Stripe test card in test mode: 4242 4242 4242 4242).
3. They are redirected to your success_url (a web page or an app deep link).
4. Stripe confirms → Paylo activates the subscription and sends your server a signed webhook.
5. Your app checks access with GET /v1/customers/:id/status (SDK: Paylo.hasEntitlement('pro')).

Base URL: ${API_URL}  (all endpoints under /v1). Docs: ${DOCS_URL}`,
  },

  keys: {
    title: "API keys — publishable (pk_) vs secret (sk_), test vs live",
    body: `Each environment has two keys (Dashboard → Settings → API keys):
- Publishable key \`pk_test_…\` / \`pk_live_…\`: goes INSIDE the app (Paylo.configure). Only reaches what the SDKs call: GET /v1/sdk/bootstrap, POST /v1/customers/identify (SDK anon_ ids only), POST /v1/sessions, GET /v1/sessions/:id, POST /v1/subscriptions, GET /v1/subscriptions/:id, GET /v1/customers/:customerId/status, POST /v1/subscriptions/:id/portal, POST /v1/subscriptions/:id/change-plan. Anything else → 403.
- Secret key \`sk_test_…\` / \`sk_live_…\`: server-side only, reaches every endpoint. NEVER put it in an app, a web page or a public repo.
- Key regeneration and account deletion are dashboard-only.

Header: \`Authorization: Bearer <key>\`. The key's mode (_test_/_live_) selects the Stripe environment. Plans, subscriptions, payments, customers and stats are separate per mode. Paywalls and targeting rules are SHARED by both modes (publishing/editing affects live immediately).

Keys are shown once at creation; regenerate in Settings if lost or leaked (the old key stops working immediately).`,
  },

  prerequisites: {
    title: "Before the first checkout — required setup",
    body: `1. Publishable key for the app, secret key for your server (Settings → API keys).
2. Default redirect URLs — Settings → Redirect URLs: Success URL and Cancel URL (a web page, or an app deep link such as myapp://paylo/success). REQUIRED for SDK checkouts: the SDKs never pass their own URLs, so without defaults checkout creation fails with 400 "success_url and cancel_url are required". Server calls can pass success_url / cancel_url per request instead.
3. At least one plan (Dashboard → Payments, or POST /v1/plans with the secret key), with the entitlements it grants (e.g. ["pro"]).
4. For paywalls: design one in Dashboard → Paywalls and Publish it (non-subscribers get the published paywall when no targeting rule matches).
5. Test in test mode with card 4242 4242 4242 4242, any future expiry, any CVC.

Tip: the paylo_check_setup tool verifies all of this for the account behind PAYLO_SECRET_KEY.`,
  },

  flutter: {
    title: "Flutter SDK (most complete: setup, paywall, account screen)",
    body: `Install (pubspec.yaml):
\`\`\`yaml
dependencies:
  paylo:
    git:
      url: https://github.com/ssid131133-star/paylo-flutter.git
      ref: v0.9.0
\`\`\`

Integration:
\`\`\`dart
import 'package:paylo/paylo.dart';
import 'package:paylo/paylo_paywall.dart';

// main(), before runApp — publishable key only:
await Paylo.configure('pk_test_...');   // anonymous customer id + plans preloaded

// Show the right paywall (server-side targeting, A/B, trials, offers):
await PayloPaywall.showIfNeeded(context, placement: 'onboarding');

// Gate features by entitlement (set on plans in the dashboard):
if (await Paylo.hasEntitlement('pro')) { /* unlock */ }
// or: await Paylo.isSubscribed()

// At login / logout:
await Paylo.identify(user.id);   // merges the anonymous history into the user id
await Paylo.logOut();

// Complete "my subscription" screen (plan, renewal, Manage button, plan switching):
Scaffold(body: PayloAccountView())

// Embedded paywall instead of a modal:
PayloPaywall.inline(placement: 'subscription_page')

// Straight to checkout from your own UI:
await Paylo.instance.subscribe(planId: 'pro_monthly', customerId: Paylo.customerId);

// Stripe customer portal (cancel, card, invoices); false if nothing to manage:
await Paylo.openManagement();
\`\`\`

Notes:
- Checkout opens in the device browser; when the user returns, read access again (hasEntitlement). Activation follows Stripe's confirmation, usually within seconds.
- The paywall reports impressions/dismissals/checkout opens automatically and passes win-back offer tokens to checkout by itself.
- Requires default redirect URLs in Settings (see prerequisites).
- Paylo.plans gives the preloaded plans for a custom pricing UI; Paylo.status() returns the full CustomerStatus.`,
  },

  swift: {
    title: "Swift SDK (iOS / macOS) — client + SwiftUI paywall view",
    body: `Not publicly distributed yet (no Swift Package Manager release): get the package from the Paylo team and add it as a local package (Xcode → File → Add Package Dependencies → Add Local…). Flutter is the only SDK installable from a public repo today. There is no Paylo.configure on Swift: pass your Developer ID (Settings → API keys) where required.

\`\`\`swift
import Paylo
let paylo = Paylo(apiKey: "pk_test_...")

let resolved = try await paylo.resolvePaywall(developerId: devId, customerId: user.id, placement: "onboarding")
if let paywall = resolved.paywall {
    PayloPaywallView(paywall: paywall) { plan in
        await paylo.logPaywallEvent(developerId: devId, paywallId: paywall.id, customerId: user.id,
                                    type: "checkout_opened", ruleId: resolved.ruleId)
        try await paylo.subscribe(planId: plan.slug, customerId: user.id,
                                  offerToken: resolved.offer?.token)
    } onClose: { dismiss() }
    .task { await paylo.logPaywallEvent(developerId: devId, paywallId: paywall.id, customerId: user.id,
                                        type: "impression", ruleId: resolved.ruleId) }
}

let status = try await paylo.customerStatus(user.id)
if status.hasEntitlement("pro") { /* unlock */ }
if let active = status.activeSubscription {
    try await paylo.openPortal(active.id, returnUrl: "https://yourapp.com/account")
}
\`\`\`
Unlike Flutter, log paywall events yourself (impression, dismiss, checkout_opened) — they feed analytics and frequency caps — and forward resolved.offer?.token to subscribe. Default redirect URLs in Settings are required unless you pass successUrl/cancelUrl.`,
  },

  kotlin: {
    title: "Kotlin SDK (Android) — client and models only",
    body: `Not publicly distributed yet (no Maven release): get the module from the Paylo team and include it as a source module. JVM client with models; no paywall UI (render paywall.config yourself, e.g. in Compose) and no automatic browser opening (open URLs in a Custom Tab).

\`\`\`kotlin
val paylo = Paylo("pk_test_...", appVersion = BuildConfig.VERSION_NAME, cacheDir = context.cacheDir)

val resolved = paylo.resolvePaywall(developerId = devId, customerId = user.id, placement = "onboarding")
resolved.paywall?.let { paywall ->
    paylo.logPaywallEvent(devId, paywall.id, user.id, "impression", resolved.ruleId)
    // render paywall.config + paywall.plans, then on tap:
    val sub = paylo.subscribe(planId = "pro_monthly", customerId = user.id, offerToken = resolved.offer?.token)
    // open sub.url in a Custom Tab
}
val status = paylo.customerStatus(user.id)
if (status.hasEntitlement("pro")) { /* unlock */ }
\`\`\`
openPortal(subscriptionId, returnUrl) requires returnUrl on Kotlin. Developer ID: Settings → API keys.`,
  },

  web: {
    title: "Web apps (no SDK — REST from your server)",
    body: `1. Server (secret key) creates the checkout:
\`\`\`js
const res = await fetch("${API_URL}/v1/subscriptions", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.PAYLO_SECRET_KEY}\`, // sk_…
    "Content-Type": "application/json",
    "Idempotency-Key": \`checkout-\${user.id}-\${Date.now()}\`,   // optional
  },
  body: JSON.stringify({
    plan_id: "pro_monthly",
    customer_id: user.id,
    customer_email: user.email,               // optional, pre-fills checkout
    success_url: "https://yourapp.com/welcome",
    cancel_url: "https://yourapp.com/pricing",
  }),
});
const { url } = await res.json();             // redirect the browser to url
\`\`\`
2. The customer pays on the hosted checkout and lands on success_url.
3. Grant access from the webhook (subscription.activated) or a server-side GET /v1/customers/:id/status. Never unlock on the success_url redirect alone.

Never call the API with the secret key from the browser. Paywalls are a mobile feature; on the web build your own pricing page (GET /v1/plans with the secret key, or GET /v1/public/:developerId/plans).`,
  },

  subscriptions: {
    title: "Plans and subscriptions API",
    body: `Create a plan (secret key): POST /v1/plans
  slug (required, [a-z0-9_-]), name (required), amount (cents, min 50), currency (eur|usd|gbp, default eur), interval (daily|weekly|monthly|yearly|one_time, default monthly), trial_days (1–365, recurring only), entitlements (string[]), description.
  Plans are per mode and CAN'T BE EDITED: to change a price create a new plan. A deleted plan's slug stays reserved (use pro_monthly_v2).

Subscribe: POST /v1/subscriptions (pk_ or sk_) { plan_id (slug or UUID), customer_id (your stable user id), customer_email?, success_url?, cancel_url?, offer_token? } → 201 { id (UUID), url, status: "pending" }. Accepts Idempotency-Key. Sells one_time plans too (lifetime access). Abandoned checkouts expire after 24h.

Customer status: GET /v1/customers/:customerId/status →
{ customer_id, has_active_subscription, is_trial, entitlements[], can_manage, scheduled_change, active_plan { name, slug, amount, currency, interval, current_period_end, trial_end? }, subscriptions[] }
active, trialing and cancelling count as active; past_due does not (access returns if Stripe's retry succeeds). Entitlements = union across active subscriptions.

Statuses: pending → (trialing) → active → cancelling → cancelled; also past_due, refunded, expired.

Cancel (secret key): POST /v1/subscriptions/:id/cancel — 1st call: cancel at period end (cancelling); 2nd call: immediate. pending → cancelled now. Ended subs → 400. Stripe refusal → 502, nothing changed.
Change plan: POST /v1/subscriptions/:id/change-plan { new_plan_id, preview? } — upgrades/lateral bill proration now, downgrades apply at period end; 409 if a change is already scheduled; refused across currencies or with one_time plans.
Portal: POST /v1/subscriptions/:id/portal { return_url? } → { url } (not for lifetime purchases, can_manage=false).
Refund (secret key): POST /v1/refunds { subscription_id, reason? } — refunds the latest charge, cancels immediately, status refunded; once only. Not available for lifetime purchases or one-time sessions.

Free trials: set trial_days on the plan; checkout collects the card, charges nothing; status trialing (has access); webhooks subscription.trial_started then subscription.trial_ending 3 days before the first charge.`,
  },

  one_time: {
    title: "One-time payments vs lifetime plans",
    body: `- Lifetime access / feature unlock → create a plan with interval "one_time" and sell it with POST /v1/subscriptions. The customer then has has_active_subscription: true for good, entitlements apply, webhook subscription.activated (plan_interval "one_time"), win-back offers apply, no portal (can_manage false).
- Purchases your server fulfils itself (credit packs…) → POST /v1/sessions { product_name, amount (cents, min 50), currency?, description?, success_url?, cancel_url? } → { id, url, status }. GET /v1/sessions/:id → pending | completed | expired. Webhook payment.completed { session_id, product_name, amount, currency, status }. A session is NOT tied to a customer: it never shows in customer status and grants no entitlement. SDKs: checkout() + waitForPayment(sessionId).`,
  },

  webhooks: {
    title: "Webhooks — events, payload, signature, retries",
    body: `Configure the URL in Settings (http/https). The signing secret (whsec_…) is right below it (Reveal / Copy). One URL receives BOTH modes: check the top-level "mode" and never grant real access for a test event.

Events: payment.completed, subscription.activated (also for lifetime purchases), subscription.trial_started, subscription.trial_ending, subscription.renewed (each paid invoice: renewals, trial conversion; may also follow activated for the first charge), subscription.payment_failed (past_due, Stripe retries), subscription.updated (status/plan/period changed), subscription.cancelled.

Payload: { "event": "...", "mode": "test"|"live", "data": {...}, "timestamp": 1752312345 }
subscription.* data: id (Paylo subscription UUID), customer_id, customer_email, status, plan_name, plan_amount, plan_currency, plan_interval, current_period_end, trial_end (during a trial).
Headers: X-Paylo-Signature: sha256=<hex HMAC-SHA256 of the RAW body with the whsec secret>, X-Paylo-Timestamp.
Verify against the raw body (re-serialized JSON breaks the signature). Respond 2xx within 10 s; failures retry after 1 min, 5 min, 30 min, 2 h (5 attempts). No event id: dedupe on event + data.id (+ current_period_end), prefer setting state over incrementing.
Use paylo_webhook_handler for a ready-to-paste handler in your language.`,
  },

  paywalls: {
    title: "Native paywalls (remote config)",
    body: `Design in Dashboard → Paywalls (live phone preview): title/subtitle, features (≤8), up to 4 plans with a highlighted one, theme/accent/background, hero image, badges, per-plan notes and strike prices, countdown, social proof, secondary button, footer, terms/privacy links, localizations, bottom-sheet height (50–100%). Only one paywall is published at a time — the default apps receive. Paywalls are shared by test and live; plans are looked up by slug in the app's mode, so create live plans with the same slugs.

Flutter: PayloPaywall.showIfNeeded(context, placement:, attributes:, preselectedPlanSlug:) / PayloPaywall.inline(...). Swift: PayloPaywallView. Kotlin: render it yourself.
REST: POST /v1/public/:developerId/paywall/resolve { customer_id, placement?, platform? (ios|android|web), locale?, app_version?, attributes? } → { paywall | null, rule_id, reason, offer? }. reason ∈ rule_matched, published_fallback, audience_no_match, frequency_capped, already_subscribed, no_match. Also GET /v1/public/:developerId/paywall (published), /paywalls (all), POST /paywall-events { paywall_id, customer_id, type: impression|dismiss|checkout_opened, rule_id?, placement? }.
Offline: Flutter and Swift cache the last resolve 7 days; Kotlin with cacheDir.`,
  },

  targeting: {
    title: "Targeting rules, A/B tests, offers",
    body: `Rules (Dashboard → Paywalls → Targeting), evaluated server-side by priority (higher first; at equal priority a placement-specific rule beats a wildcard). A rule = audience (subscription status never/churned/active — default non-subscribers; platforms; locales; min app version; days since first seen; custom attributes with eq/neq/gt/gte/lt/lte/contains, all ANDed) + placement (empty = any) + schedule + frequency caps (max shows total/per day, cooldown after dismiss, stop after N dismissals) + 1–4 weighted variants (A/B, stable per customer) + optional offer (% off once / N months / forever).
"Audience only" (default on new rules): placement+schedule match but audience doesn't → show nothing instead of the published paywall.
No rule matched → non-subscribers get the published paywall; subscribers get nothing.
Offers: resolve returns a signed offer.token (24h); Flutter passes it automatically, otherwise pass offer_token to POST /v1/subscriptions. Works for one_time plans too.
Rules are shared by test and live — scope experiments with a custom attribute only your test build sends (e.g. beta eq true). Debug with the resolve "reason" field (tool: paylo_resolve_paywall).`,
  },

  troubleshooting: {
    title: "Common errors and fixes",
    body: `- 400 "success_url and cancel_url are required…" → set default Redirect URLs in Settings (SDK checkouts) or pass both URLs.
- 403 "This endpoint requires your secret key (sk_…)" → that call must run on your server with sk_; the app's pk_ only reaches SDK endpoints.
- 401 "Invalid API key" → wrong/rotated key, or a pk_/sk_ from another mode/account.
- 404 "Plan not found" → slug doesn't exist in this key's mode (test and live plans are separate) or the plan was deleted.
- 409 on POST /v1/plans → slug already used (deleted plans keep their slug).
- 403 on identify → with a pk_, previous_customer_id must be the SDK's anon_ id; merge other ids from your server with sk_.
- Paywall not showing → check resolve's "reason": already_subscribed, audience_no_match (audience-only rule), frequency_capped (Reset stats on the rule), no_match (nothing published).
- Subscription stays pending → the customer didn't finish checkout, or test card not used; it expires after 24h.
- Webhook signature mismatch → hash the raw body bytes, use the whsec_ secret from Settings, strip "sha256=".
- 429 → 100 requests/min per IP.`,
  },

  api_reference: {
    title: "Endpoint list (pk_ = callable with the publishable key)",
    body: `Plans: POST /v1/plans · GET /v1/plans · DELETE /v1/plans/:id · GET /v1/public/:developerId/plans (no key)
Subscriptions: POST /v1/subscriptions (pk_) · GET /v1/subscriptions?status&search&from&to · GET /v1/subscriptions/:id (pk_) · POST /v1/subscriptions/:id/cancel · POST /v1/subscriptions/:id/change-plan (pk_) · POST /v1/subscriptions/:id/portal (pk_) · POST /v1/refunds
Customers: GET /v1/customers/:customerId/status (pk_) · POST /v1/customers/identify (pk_: anon_ ids only) · GET /v1/sdk/bootstrap (pk_)
One-time: POST /v1/sessions (pk_) · GET /v1/sessions/:id (pk_)
Paywalls: POST/GET /v1/paywalls · GET/PATCH/DELETE /v1/paywalls/:id · POST /v1/paywalls/:id/publish|unpublish · GET /v1/paywalls/analytics?days=30
Rules: POST/GET /v1/paywall-rules · PATCH/DELETE /v1/paywall-rules/:id · POST /v1/paywall-rules/:id/reset-events
Public (no key; send the pk_ to pin the mode): POST /v1/public/:developerId/paywall/resolve · GET /v1/public/:developerId/paywall · GET /v1/public/:developerId/paywalls · POST /v1/public/:developerId/paywall-events
Account: GET /v1/developers/me · /me/stats · /me/stats/history · /me/customers · /me/sessions · /me/logs · /me/webhook-logs (+ /:id/resend) · PATCH /me/webhook · /me/redirects · /me/branding · /me/notifications (+ POST /test) · PATCH /me/mode · DELETE /me/test-data
Dashboard only: POST /v1/developers/me/regenerate-key · DELETE /v1/developers/me
Health: GET /health`,
  },
} as const;

export type TopicId = keyof typeof TOPICS;
export const TOPIC_IDS = Object.keys(TOPICS) as TopicId[];

export function renderTopic(id: TopicId): string {
  const t = TOPICS[id];
  return `# ${t.title}\n\n${t.body}\n\nMore: ${DOCS_URL}`;
}

// Keyword search across topic paragraphs — enough for "how do I…" questions.
export function searchDocs(query: string, limit = 5): { topic: TopicId; title: string; excerpt: string; score: number }[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .filter((t) => t.length > 1);
  if (!terms.length) return [];
  const hits: { topic: TopicId; title: string; excerpt: string; score: number }[] = [];
  for (const id of TOPIC_IDS) {
    const { title, body } = TOPICS[id];
    for (const para of body.split(/\n\s*\n/)) {
      const hay = `${title}\n${para}`.toLowerCase();
      const score = terms.reduce((s, t) => s + (hay.split(t).length - 1), 0);
      if (score > 0) hits.push({ topic: id, title, excerpt: para.trim(), score });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export type Platform = "flutter" | "swift" | "kotlin" | "web";

export function integrationGuide(platform: Platform): string {
  const parts: TopicId[] = ["prerequisites", "keys", platform, "subscriptions", "webhooks"];
  return [
    `# Integrating Paylo — ${platform}`,
    "Follow the sections in order. Use paylo_check_setup to verify the dashboard side once PAYLO_SECRET_KEY is set.",
    ...parts.map((id) => `## ${TOPICS[id].title}\n\n${TOPICS[id].body}`),
    `Full docs: ${DOCS_URL}`,
  ].join("\n\n");
}

export type WebhookLanguage = "node" | "python" | "go" | "php" | "ruby";

export function webhookHandler(language: WebhookLanguage): string {
  const intro =
    "Verify X-Paylo-Signature (sha256=<HMAC-SHA256(raw body, whsec)>) before trusting the payload, ignore test events in production, then set the user's access state.";
  const code: Record<WebhookLanguage, string> = {
    node: `\`\`\`js
// Express — mount BEFORE any JSON body parser for this route
import crypto from "crypto";
import express from "express";

const app = express();
app.post("/paylo-webhook", express.raw({ type: "application/json" }), (req, res) => {
  const expected = crypto.createHmac("sha256", process.env.PAYLO_WEBHOOK_SECRET).update(req.body).digest("hex");
  const received = String(req.headers["x-paylo-signature"] ?? "").replace("sha256=", "");
  if (received.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
    return res.status(400).send("bad signature");
  }
  const { event, mode, data } = JSON.parse(req.body.toString("utf8"));
  if (mode !== process.env.PAYLO_MODE) return res.sendStatus(200); // e.g. "live" in production

  switch (event) {
    case "subscription.activated":
    case "subscription.trial_started":
    case "subscription.renewed":
      // grant access to data.customer_id until data.current_period_end
      break;
    case "subscription.cancelled":
      // revoke access for data.customer_id
      break;
    case "payment.completed":
      // fulfil the one-time purchase data.session_id
      break;
  }
  res.sendStatus(200);
});
\`\`\``,
    python: `\`\`\`python
# Flask
import hashlib, hmac, json, os
from flask import Flask, request, abort

app = Flask(__name__)

@app.post("/paylo-webhook")
def paylo_webhook():
    raw = request.get_data()  # raw bytes — don't use request.json for the signature
    expected = hmac.new(os.environ["PAYLO_WEBHOOK_SECRET"].encode(), raw, hashlib.sha256).hexdigest()
    received = request.headers.get("X-Paylo-Signature", "").removeprefix("sha256=")
    if not hmac.compare_digest(expected, received):
        abort(400)
    payload = json.loads(raw)
    if payload["mode"] != os.environ.get("PAYLO_MODE", "live"):
        return "", 200
    event, data = payload["event"], payload["data"]
    if event in ("subscription.activated", "subscription.trial_started", "subscription.renewed"):
        pass  # grant access to data["customer_id"] until data["current_period_end"]
    elif event == "subscription.cancelled":
        pass  # revoke access
    elif event == "payment.completed":
        pass  # fulfil data["session_id"]
    return "", 200
\`\`\``,
    go: `\`\`\`go
func payloWebhook(w http.ResponseWriter, r *http.Request) {
	raw, _ := io.ReadAll(r.Body)
	mac := hmac.New(sha256.New, []byte(os.Getenv("PAYLO_WEBHOOK_SECRET")))
	mac.Write(raw)
	expected := hex.EncodeToString(mac.Sum(nil))
	received := strings.TrimPrefix(r.Header.Get("X-Paylo-Signature"), "sha256=")
	if !hmac.Equal([]byte(expected), []byte(received)) {
		http.Error(w, "bad signature", http.StatusBadRequest)
		return
	}
	var p struct {
		Event string                 \`json:"event"\`
		Mode  string                 \`json:"mode"\`
		Data  map[string]interface{} \`json:"data"\`
	}
	json.Unmarshal(raw, &p)
	if p.Mode != os.Getenv("PAYLO_MODE") {
		w.WriteHeader(http.StatusOK)
		return
	}
	switch p.Event {
	case "subscription.activated", "subscription.trial_started", "subscription.renewed":
		// grant access to p.Data["customer_id"]
	case "subscription.cancelled":
		// revoke access
	}
	w.WriteHeader(http.StatusOK)
}
\`\`\``,
    php: `\`\`\`php
<?php
$raw = file_get_contents('php://input');
$expected = hash_hmac('sha256', $raw, getenv('PAYLO_WEBHOOK_SECRET'));
$received = str_replace('sha256=', '', $_SERVER['HTTP_X_PAYLO_SIGNATURE'] ?? '');
if (!hash_equals($expected, $received)) { http_response_code(400); exit; }

$payload = json_decode($raw, true);
if ($payload['mode'] !== getenv('PAYLO_MODE')) { http_response_code(200); exit; }

switch ($payload['event']) {
  case 'subscription.activated':
  case 'subscription.trial_started':
  case 'subscription.renewed':
    // grant access to $payload['data']['customer_id']
    break;
  case 'subscription.cancelled':
    // revoke access
    break;
}
http_response_code(200);
\`\`\``,
    ruby: `\`\`\`ruby
# Sinatra
post "/paylo-webhook" do
  raw = request.body.read
  expected = OpenSSL::HMAC.hexdigest("SHA256", ENV.fetch("PAYLO_WEBHOOK_SECRET"), raw)
  received = request.env["HTTP_X_PAYLO_SIGNATURE"].to_s.delete_prefix("sha256=")
  halt 400 unless Rack::Utils.secure_compare(expected, received)

  payload = JSON.parse(raw)
  halt 200 unless payload["mode"] == ENV.fetch("PAYLO_MODE", "live")

  case payload["event"]
  when "subscription.activated", "subscription.trial_started", "subscription.renewed"
    # grant access to payload["data"]["customer_id"]
  when "subscription.cancelled"
    # revoke access
  end
  200
end
\`\`\``,
  };
  return `# Paylo webhook handler — ${language}\n\n${intro}\n\n${code[language]}\n\nThe secret is in Dashboard → Settings → Webhook endpoint (Reveal). Dedupe: no event id — use event + data.id (+ current_period_end). Respond 2xx within 10 s.`;
}
