# Jamora - Deployment Guide

Jamora sekarang jalan sebagai stack self-hosted:

| App | Path | What it is | Runtime |
| --- | --- | --- | --- |
| **Storefront** | [jamora-web/](jamora-web/) | Customer-facing Next.js site | Node |
| **CMS / Admin** | [jamora-strapi/](jamora-strapi/) | Strapi content dashboard + product API | Node + Postgres |
| **Database** | Docker volume `pgdata` | Product/order CMS data | Postgres |

Storefront membaca katalog dari Strapi. Kalau Strapi belum ready atau error,
storefront tetap render mock catalogue supaya site tidak blank.

---

## Deploy With Docker Compose (Linux Dev Server)

Ports default:

| Service | URL |
| --- | --- |
| Storefront | `http://<server>:3095` |
| Strapi Admin | `http://<server>:9014/admin` |
| Postgres | `<server>:5439` |

From repo root on the Linux server:

```bash
cp .env.example .env
nano .env
```

Minimal `.env` edits:

```bash
POSTGRES_PASSWORD=$(openssl rand -hex 24)

STRAPI_APP_KEYS=$(openssl rand -base64 32),$(openssl rand -base64 32),$(openssl rand -base64 32),$(openssl rand -base64 32)
STRAPI_API_TOKEN_SALT=$(openssl rand -base64 32)
STRAPI_ADMIN_JWT_SECRET=$(openssl rand -base64 32)
STRAPI_TRANSFER_TOKEN_SALT=$(openssl rand -base64 32)
STRAPI_JWT_SECRET=$(openssl rand -base64 32)

STRAPI_PUBLIC_URL=http://<server>:9014
STRAPI_PORT=9014
TRUST_PROXY=false
STOREFRONT_PORT=3095
POSTGRES_PORT=5439
JAMORA_COST_RATIO=0.42
JAMORA_STOREFRONT_URL=https://jamora.kaumtech.com
JAMORA_ADMIN_API_SECRET=$(openssl rand -base64 32)
JAMORA_STOREFRONT_API_SECRET=$(openssl rand -base64 32)
CUSTOMER_SESSION_TOKEN=$(openssl rand -base64 48)

# Independent Phase 0 rollout flags
CUSTOMER_ACCOUNTS_ENABLED=false
CUSTOMER_VERIFICATION_DELIVERY_ENABLED=false
STRUCTURED_CHECKOUT_ENABLED=false
```

`CUSTOMER_SESSION_TOKEN` signs customer sessions and must be long, random, and
different from `ADMIN_SESSION_TOKEN`, Strapi JWT secrets, and the two
storefront/admin API secrets. Rotating it logs out every customer session.

Enable each Phase 0 surface independently after deploying the additive schemas:

```bash
STRUCTURED_CHECKOUT_ENABLED=true
```

- `CUSTOMER_ACCOUNTS_ENABLED=false` disables the account routes/API while guest
  checkout remains available.
- Production customer accounts remain disabled until Phase 6 supplies a real
  verification/recovery delivery path. In production,
  `CUSTOMER_ACCOUNTS_ENABLED=true` additionally requires
  `CUSTOMER_VERIFICATION_DELIVERY_ENABLED=true`; otherwise both the storefront
  and direct Strapi customer endpoints return 404. Do not set the delivery flag
  merely to bypass this safety check.
- Public customer authentication has conservative per-operation IP and
  normalized-account windows (`CUSTOMER_AUTH_RATE_LIMIT=8`,
  `CUSTOMER_AUTH_RATE_WINDOW_MS=60000`), a bounded bucket store
  (`CUSTOMER_AUTH_RATE_MAX_BUCKETS=10000`), and bounded password hashing
  (`CUSTOMER_AUTH_HASH_CONCURRENCY=4`,
  `CUSTOMER_AUTH_HASH_QUEUE_LIMIT=32`). Storefront-proxied requests authenticate
  with the shared secret and use account buckets without sharing the
  container IP bucket; direct Strapi callers use both IP and account buckets.
  This in-memory limiter is a
  single-Strapi-instance foundation; replace it with a shared Redis/distributed
  limiter before running multiple Strapi replicas.
- `STRUCTURED_CHECKOUT_ENABLED=false` keeps legacy text-address checkout and
  omits the new structured address/currency persistence path.
- Both flags can be false at the same time for the pre-Phase-0 behavior.

Then build and start:

```bash
docker compose up -d --build
```

Watch boot logs:

```bash
docker compose ps
docker compose logs -f strapi
docker compose logs -f storefront
```

On first boot, open `http://<server>:9014/admin` and create the first Strapi
admin user. The app also seeds the initial Jamora products if the CMS product
table is empty.

If you use Nginx in front of the Docker host, keep the public domain on HTTPS
and proxy Strapi's admin/API/plugin routes to port `9014` before the storefront
catch-all:

```nginx
server {
    listen 443 ssl http2;
    server_name jamora.kaumtech.com;

    ssl_certificate     /etc/nginx/ssl/kaumtech.com.pem;
    ssl_certificate_key /etc/nginx/ssl/kaumtech.com.key;

    location ^~ /admin {
        proxy_pass http://192.168.18.204:9014;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port 443;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location ^~ /api {
        proxy_pass http://192.168.18.204:9014;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port 443;
    }

    location ^~ /uploads {
        proxy_pass http://192.168.18.204:9014;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port 443;
    }

    location ^~ /content-manager {
        proxy_pass http://192.168.18.204:9014;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port 443;
    }

    location ^~ /content-type-builder {
        proxy_pass http://192.168.18.204:9014;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port 443;
    }

    location ^~ /upload {
        proxy_pass http://192.168.18.204:9014;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port 443;
    }

    location ^~ /users-permissions {
        proxy_pass http://192.168.18.204:9014;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port 443;
    }

    location / {
        proxy_pass http://192.168.18.204:3095;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port 443;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Then set `STRAPI_PUBLIC_URL=https://jamora.kaumtech.com` in `.env`, restart the
stack, and reload Nginx:

```bash
docker compose up -d
sudo nginx -t
sudo systemctl reload nginx
```

---

## If You Are Migrating From The Old Medusa Attempt

The old compose used Medusa + Redis + a different Postgres database name. For a
fresh dev server where old data is not important, wipe the old containers and
volumes first:

```bash
docker compose down -v
docker compose up -d --build
```

This avoids the classic issue where Postgres keeps an old volume/password/schema
while the new `.env` expects Strapi settings.

---

## Day-To-Day Commands

```bash
docker compose ps
docker compose logs -f strapi
docker compose logs -f storefront
docker compose restart strapi
docker compose down
```

Wipe all database data in dev:

```bash
docker compose down -v
```

Open a Postgres shell:

```bash
docker compose exec postgres psql -U postgres -d jamora_strapi
```

Check product API from the server:

```bash
curl http://localhost:9014/api/products
```

## Phase 0 Verification and Smoke Test

Run the repository gate before deployment:

```bash
cd jamora-web
node --test src/lib/commerce/*.test.mjs
npm run lint
npm run build
cd ../jamora-strapi
node --test src/api/customer-auth/services/customer-credentials.test.mjs
npm run build
```

Automated unit, lint, build, and Compose configuration verification is complete.
Docker live smoke is still pending. In a non-production environment, use both
rollout flags and manually verify:

1. Existing staff admin login and product catalogue still work.
2. Guest checkout creates an order without a customer account.
3. The order contains a structured `RO` address and immutable EUR/RON snapshot.
4. Registration returns a demo verification link/token only outside production.
5. Verification enables login; logout clears the customer session.
6. Password reset invalidates the earlier session.
7. Every explicit consent choice creates one append-only row per purpose.
   Rejecting or withdrawing optional consent records `granted=false`; it does
   not enable optional analytics or lifecycle processing.
8. `/track` finds the guest order by order/tracking number.

Never expect raw verification/reset tokens in production responses. Configure a
transactional email delivery path before enabling customer accounts in
production. The runtime safety gate intentionally keeps them unavailable until
that delivery flag is enabled.

The Phase 0 payment record and checkout are still mock. They do not settle
funds. Live payment and provider callback handling are Phase 2 work.

---

## Editing Products

1. Open `http://<server>:9014/admin`.
2. Create the first admin account if prompted.
3. Go to **Content Manager -> Product**.
4. Edit product content, prices, stock, and featured flags.

The storefront revalidates product data periodically, so product changes should
show without rebuilding the frontend.

---

## Troubleshooting

### Strapi is unhealthy

```bash
docker compose logs --tail=200 strapi
docker compose ps
```

Common causes:

- `.env` secrets are missing.
- Postgres volume was created with a different `POSTGRES_PASSWORD`.
- Port `9014` or `5439` is already used on the server.
- The Strapi upload volume/folder was not created yet; rebuild after the latest
  Dockerfile and compose changes.

For disposable dev data:

```bash
docker compose down -v
docker compose up -d --build
```

### Strapi image fails while installing npm packages

```bash
docker compose build --no-cache strapi
docker compose up -d
```

If it still fails, print the full npm error from the failed build log. The
Strapi Dockerfile uses Node 20 and installs the small native build toolchain
needed by Strapi dependencies. It intentionally installs from `package.json`
without a committed lockfile to avoid npm lockfile/version issues across local
Windows and Linux Docker builds.

### Storefront works but products are mock data

Check Strapi:

```bash
curl http://localhost:9014/api/products
docker compose logs --tail=100 storefront
```

Inside Docker, storefront talks to Strapi through `http://strapi:1337`; do not
change that value in `docker-compose.yml` unless the service name changes.

### Postgres password errors

Postgres only applies `POSTGRES_PASSWORD` when the volume is first created. If
you changed `.env` after the first boot, either restore the old password or wipe
the dev volume:

```bash
docker compose down -v
docker compose up -d --build
```

---

## Production Notes Later

For a real paid store, the remaining pieces are:

- Manual bank-transfer and RoPay payment adapters behind the provider-neutral
  payment interface.
- Signed/verified provider callback or server-to-server status handling that
  finalizes a paid order idempotently. Browser redirects remain advisory.
- Optional future payment providers can use the same interface without changing
  the order source of truth.
- Domain + TLS via Caddy, Nginx, or Traefik.
- Transactional email for order confirmations.
- Regular Postgres backups.

No monthly CMS fee is required for this stack. You only pay for the server,
domain, payment processing, and any optional infrastructure you choose.

---

## Phase 1 Membership Deployment

Keep membership disabled while deploying the additive schemas:

```dotenv
MEMBERSHIP_ENABLED=false
MEMBERSHIP_CHECKOUT_TTL_SECONDS=600
```

`MEMBERSHIP_ENABLED` must equal the lowercase string `true` in both storefront
and Strapi environments. All other values fail closed with 404. The optional
checkout TTL accepts 60–3600 seconds and defaults to 600.

The deployment adds plan, membership, append-only credit-entry, and membership
checkout tables; product eligibility/credit-cost fields; and order membership
snapshots. Back up Postgres before migration. Do not remove or rewrite existing
ledger rows. Phase 1 payment confirmation is mock-only; Phase 2 will replace
that adapter with verified provider events. Every redemption still charges the
server shipping quote.

Run these exact repository gates on the server checkout before rollout:

```bash
cd jamora-web
node --test --test-force-exit src/lib/**/*.test.mjs src/lib/*.test.mjs
npm run lint
npm run build
cd ../jamora-strapi
node --test --test-force-exit src/api/**/*.test.mjs src/middlewares/*.test.mjs scripts/package-runtime-cjs.test.mjs
npm run build
```

After deploying with the flag still false, verify ordinary catalogue, guest
checkout, and one-time mock-paid checkout. Then set the flag to `true` in both
processes, restart them using the server's normal deployment procedure, and
perform the required dev-server live smoke:

1. disabled direct and BFF membership routes return 404;
2. owner creates, lists, edits, and disables a plan;
3. verified customer purchase activates once on retry and dashboard balance
   equals the ledger, not the cache;
4. redemption reserves stock and credits together and charges shipping only;
5. paid finalize redeems once; failed finalize and checkout expiry release both;
6. membership expiry removes unused credits once;
7. adjustment without reason fails and a reasoned adjustment is audited;
8. renewal creates a new active period and leaves the previous period unchanged;
9. guest and ordinary one-time checkout still work after enabling membership.

Local Docker/live smoke was explicitly waived for Phase 1 and was not run.
This dev-server live smoke is mandatory before production promotion.

Rollback is configuration-first: set `MEMBERSHIP_ENABLED=false` in both
processes and restart. This hides all membership UI/routes/mutations while
preserving schemas and immutable history; ordinary checkout remains available.
Do not roll back by dropping tables or deleting ledger entries.

---

## Phase 2 Payment Deployment, Rollback, and Reconciliation

Phase 2 ships additive `payment` and immutable `payment-event` schemas plus
additive links to orders and memberships. Back up PostgreSQL before deploying.
Deploy the Strapi build with both flags off first, let Strapi apply the schema,
then run the repository gates below. Never migrate by deleting payment/event
rows or by recalculating historical money: amounts are safe integer minor
units and snapshots are immutable.

Add the following values to the server `.env`; replace every `change_me` value
with a secret manager/runtime value and never commit the real file:

```dotenv
PAYMENTS_ENABLED=false
PAYMENT_BENEFICIARY_NAME=Jamora SRL
PAYMENT_BENEFICIARY_IBAN=RO49AAAA1B31007593840000
PAYMENT_BENEFICIARY_BANK=Example Bank
PAYMENT_TRANSFER_TTL_SECONDS=259200

ROPAY_ENABLED=false
ROPAY_PROVIDER_MODE=mock
ROPAY_CALLBACK_SECRET=change_me_generate_with_openssl_rand_base64_48
ROPAY_INTENT_TTL_SECONDS=600
ROPAY_RATE_LIMIT=60
ROPAY_RATE_WINDOW_MS=60000
ROPAY_RATE_MAX_BUCKETS=10000
ROPAY_AUTH_RATE_LIMIT=10
ROPAY_AUTH_REPLAY_LIMIT=3
ROPAY_AUTH_RATE_WINDOW_MS=60000
ROPAY_AUTH_RATE_MAX_BUCKETS=10000
```

Bank transfer requires only `PAYMENTS_ENABLED=true`; RoPay requires both
`PAYMENTS_ENABLED=true` and `ROPAY_ENABLED=true`. Both flags accept only exact
lowercase `true`.
`PAYMENT_TRANSFER_TTL_SECONDS` is 300–604800 seconds (default 72 hours);
`ROPAY_INTENT_TTL_SECONDS` is 60–900 seconds (default 600). The current
RoPay adapter is deliberately `mock` only. Setting `ROPAY_PROVIDER_MODE=live`
does not enable live charging—it fails closed until a reviewed real adapter is
implemented. The real adapter contract must preserve the payment reference,
provider reference, amount/currency, expiry, signed callback/status envelope,
and idempotency semantics; it must not let provider presentation or a browser
redirect become settlement authority.

Pass these variables to the Strapi container. The storefront needs only
`PAYMENTS_ENABLED` and `ROPAY_ENABLED` for feature visibility; callback secret,
beneficiary, provider mode, and rate-limit values remain server-side in Strapi.
The Compose file is wired accordingly.

### Callback and reverse-proxy setup

Register the external provider callback URL as:

```text
https://<public-domain>/api/jamora/payments/ropay/callback
```

Use the same high-entropy value for the provider HMAC secret and
`ROPAY_CALLBACK_SECRET`. The provider must send `x-ropay-signature`,
`x-ropay-timestamp`, and `x-ropay-provider-reference`; the Strapi route accepts
only canonical signed payload fields. Server-to-server verification is
`POST /api/jamora/internal/payments/ropay/status` with the same signing model.
Do not expose it to a browser integration. Keep the existing Nginx `/api`
proxy before the storefront catch-all and preserve the three RoPay headers and
the 4096-byte callback body limit.

Set `TRUST_PROXY=true` only when Nginx (or another controlled proxy) is the
sole network path to Strapi: bind port `9014` to loopback/private networking,
block direct public access with the host firewall/security group, and have the
proxy overwrite—not append untrusted—`X-Forwarded-For`, `X-Forwarded-Proto`,
and `X-Real-IP`. In that deployment Koa derives `ctx.ip` from the forwarded
client address, allowing the RoPay pre-verification limiter to distinguish
provider clients. Leave `TRUST_PROXY=false` for local/direct Strapi access;
otherwise a client can forge forwarded headers and evade IP buckets.

### Canonical RoPay HMAC contract

For callback verification, sign UTF-8 bytes of exactly:

```text
ropay-callback\n<timestamp>\n<canonical-json>
```

For the internal status endpoint, the domain is exactly
`ropay-status\n<timestamp>\n<canonical-json>`. `timestamp` must be an exact
ISO-8601 UTC instant within the configured five-minute tolerance. The
canonical JSON has no extra fields and this exact insertion order:

```json
{"providerEventId":"...","providerReference":"...","paymentReference":"...","status":"paid","amountMinor":10000,"currency":"RON","occurredAt":"..."}
```

`status` is lowercase `pending`, `paid`, or `failed`; `amountMinor` is a safe
integer; RoPay currency is `RON`. The signature header is
`sha256=<lowercase-hex-hmac-sha256>`. This reproducible Linux shell example
uses placeholders only and emits a callback curl command:

```bash
export ROPAY_CALLBACK_SECRET='replace-with-secret-manager-value'
export ROPAY_BASE_URL='https://<public-domain>'
node - <<'NODE'
const { createHmac } = require('node:crypto');
const payload = {
  providerEventId: 'smoke-event-001', providerReference: 'RPI-SMOKE-001',
  paymentReference: 'JMR-ROPAY-SMOKE', status: 'paid', amountMinor: 10000,
  currency: 'RON', occurredAt: new Date().toISOString(),
};
const timestamp = new Date().toISOString();
const body = JSON.stringify(payload);
const signature = `sha256=${createHmac('sha256', process.env.ROPAY_CALLBACK_SECRET)
  .update(`ropay-callback\n${timestamp}\n${body}`).digest('hex')}`;
console.log(JSON.stringify({ payload, timestamp, signature }));
NODE
# Copy the JSON values above; do not log or persist the real secret.
curl --fail-with-body -X POST "$ROPAY_BASE_URL/api/jamora/payments/ropay/callback" \
  -H 'content-type: application/json' \
  -H 'x-ropay-provider-reference: RPI-SMOKE-001' \
  -H 'x-ropay-timestamp: <timestamp>' \
  -H 'x-ropay-signature: <signature>' \
  --data '<canonical-json>'
```

For `/api/jamora/internal/payments/ropay/status`, use the same payload/header
format but compute `ropay-status` rather than `ropay-callback`. Use a fresh
event identity and a pre-created matching payment; never aim this smoke command
at production or replay a live provider event.

There are two bounded, in-memory protections: the pre-verification request
guard (`ROPAY_RATE_*`) and the verified-reference/replay limiter
(`ROPAY_AUTH_*`). They are appropriate only for one Strapi process. Before
running multiple replicas, replace both with a shared Redis/distributed
implementation and validate its replay semantics.

### Enable, rollback, and reconciliation runbook

After the additive deployment and smoke pass, enable bank transfer first:

```dotenv
PAYMENTS_ENABLED=true
ROPAY_ENABLED=false
```

Restart Strapi and storefront. After the provider callback smoke passes, set
`ROPAY_ENABLED=true` in both processes and restart again. To roll back,
set `ROPAY_ENABLED=false` (RoPay only) or `PAYMENTS_ENABLED=false` (all Phase 2
surfaces) in both processes and restart. This hides new routes/UI without
touching payment, order, membership, or immutable event history.

For reconciliation, an owner lists payment records and compares the provider
or bank statement reference, amount, currency, and received time with the
stored payment/event history. Exact bank receipts settle automatically once.
For `underpaid`, `overpaid`, or `currency_mismatch`, record the owner’s
accept/cancel decision with a concrete reason; never force-edit payment status.
Duplicate provider events must be retried with their original signed payload,
not recreated. Escalate unmatched or expired funds for refund/manual review.
Browser return pages are read-only evidence and must never be used to settle.

### Required gates and dev-server smoke

Run this non-Docker gate from a clean checkout:

```bash
cd jamora-web
node --test --test-force-exit src/lib/**/*.test.mjs src/lib/*.test.mjs
npm run lint
npm run build
cd ../jamora-strapi
node --test --test-force-exit src/api/**/*.test.mjs src/middlewares/*.test.mjs scripts/package-runtime-cjs.test.mjs
npm run build
```

Docker was explicitly waived locally for Phase 2. It is not a production
waiver: a dev server backed by PostgreSQL and the provider callback/status
configuration must complete the following before production promotion:

1. With both flags false, confirm payment public/admin/direct paths return 404
   and ordinary legacy checkout still works.
2. Enable bank transfer, prepare an order payment, verify beneficiary/reference
   and expiry, then submit underpaid, overpaid, and wrong-currency receipts.
   Confirm no stock/order/membership settlement occurs until a reasoned owner
   resolution; verify an exact receipt and replay settle exactly once.
3. Enable mock RoPay, create an intent, and deliver a provider-signed callback
   to the HTTPS callback URL. Verify the signed callback settles once, exact
   replay is idempotent, invalid signature is rejected, and the signed internal
   status route has the same authority.
4. Open the RoPay return/status URL with the owning session/capability and
   verify it is read-only. Attempt an expired callback/receipt and verify no
   settlement occurs.
5. Pay a membership purchase and verify one activation/grant; pay an ordinary
   order and verify reservation, stock, promotion, invoice, and `type: status`
   timeline entry are finalized once. Confirm disabled membership still leaves
   ordinary checkout available.

The PostgreSQL/provider smoke is a release blocker, not an optional checklist.

## Phase 3 Address and Shipping Deployment

Phase 3 was verified without Docker. Do not promote it directly from unit/build
results: the PostgreSQL/provider/proxy smoke below is mandatory on the dev
server before production.

### Additive migration and configuration

1. Back up PostgreSQL and record the restore command and backup checksum.
2. Deploy Strapi/storefront with `ADDRESS_ASSIST_ENABLED=false` and
   `SHIPPING_ENABLED=false`.
3. Start one Strapi instance and let Strapi apply the additive order,
   membership-checkout, product, `shipment`, `shipment-event`, and
   `shipment-compensation` schema changes. Never delete/recreate order/payment
   tables or recalculate historical money.
4. Confirm the unique provider event/shipment constraints and private tracking
   fields exist, then run the non-Docker gates.
5. Enable address assistance first. Enable shipping only after quote,
   payment-settlement, warehouse-label, callback, polling, and proxy smokes
   pass.

Generate independent secrets; never reuse a session, admin, payment, quote,
tracking, or label secret:

```dotenv
ADDRESS_ASSIST_ENABLED=false
ADDRESS_PROVIDER_MODE=mock
SHIPPING_ENABLED=false
SHIPPING_PROVIDER_MODE=mock
SHIPPING_PRODUCT_LOCALE=en
DEMO_EUR_RON_RATE=4.975000
SHIPPING_QUOTE_SECRET=<openssl-rand-base64-48>
SHIPMENT_LABEL_CAPABILITY_SECRET=<different-openssl-rand-base64-48>
SHIPMENT_LABEL_CAPABILITY_TTL_SECONDS=60
SHIPPING_TRACKING_WEBHOOK_SECRET=<different-openssl-rand-base64-48>

SHIPPING_WEBHOOK_IP_RATE_LIMIT=60
SHIPPING_WEBHOOK_PROVIDER_RATE_LIMIT=1000
SHIPPING_WEBHOOK_EVENT_RATE_LIMIT=10
SHIPPING_WEBHOOK_RATE_WINDOW_MS=60000
SHIPPING_WEBHOOK_RATE_MAX_BUCKETS=10000
SHIPPING_TRACKING_STARTUP_POLL_LIMIT=25
SHIPPING_TRACKING_STARTUP_TIMEOUT_MS=10000

PUBLIC_TRACKING_RATE_LIMIT=30
PUBLIC_TRACKING_CAPABILITY_RATE_LIMIT=30
PUBLIC_TRACKING_RATE_WINDOW_MS=60000
PUBLIC_TRACKING_RATE_MAX_BUCKETS=10000
PUBLIC_TRACKING_PRIVACY_FLOOR_MS=150
PUBLIC_TRACKING_BFF_RATE_LIMIT=30
PUBLIC_TRACKING_BFF_RATE_WINDOW_MS=60000
PUBLIC_TRACKING_BFF_RATE_MAX_BUCKETS=10000
```

Only `mock` address/shipping provider modes exist in this release. Any other
exact value fails closed. A live provider adapter must pass review and preserve
these contracts:

- address suggestions return only structured Romanian fields and advisory
  confidence; they never convert a warning into validation;
- quote input uses server product weight/address data, while output contains an
  opaque quote ID, carrier, service, RON minor-unit price, estimate, and expiry;
- selection revalidates the immutable address/items binding;
- shipment creation is idempotent and supports provider cancellation/
  compensation if local persistence fails;
- label download returns only allowlisted PDF/ZPL bytes from an opaque private
  label reference;
- tracking polling returns the same closed observation schema used by the
  signed webhook path;
- provider credentials, raw label locations, unrestricted URLs, and full
  provider payloads never enter a browser, audit log, or public response.

### Private labels and key rotation

Persist only the carrier AWB, provider name, service, private label reference,
and allowlisted formats. Provider label content remains at the provider or in
private storage; do not put it under public uploads. Jamora streams it with
`Cache-Control: no-store, private`, `X-Content-Type-Options: nosniff`, and a
shipment-bound single-use capability.

`SHIPMENT_LABEL_CAPABILITY_TTL_SECONDS` should remain short (60 seconds by
default). Issuing another capability supersedes the previous unused one.
Rotating `SHIPMENT_LABEL_CAPABILITY_SECRET` invalidates every outstanding
capability; schedule the restart, let warehouse staff finish active downloads,
rotate, restart all Strapi instances together, and issue fresh capabilities.
Never log a capability or include it in analytics.

### Tracking webhook HMAC and polling

Register:

```text
POST https://<public-domain>/api/jamora/shipping/tracking/webhook
```

Required headers are `content-type: application/json`,
`x-jamora-shipping-provider`, `x-jamora-shipping-timestamp` (ten-digit Unix
seconds), and `x-jamora-shipping-signature`. The signature is:

```text
sha256=HMAC-SHA256(
  SHIPPING_TRACKING_WEBHOOK_SECRET,
  <unix-seconds> + "." + <canonical-json>
)
```

Canonical JSON recursively sorts object keys and emits compact UTF-8 JSON. The
closed payload fields are exactly `awb`, `occurredAt`, `provider`,
`providerEventId`, and `status`; no extra fields are accepted. The timestamp
has a five-minute tolerance, and `occurredAt` must remain within the authenticated
envelope window. Provider event IDs are immutable: exact replay is idempotent,
but changed replay is a conflict.

Strapi runs one bounded, failure-isolated poll sweep on startup when shipping
is enabled. Schedule additional polling from a private operations runner:

```bash
curl --fail-with-body -X POST \
  https://<strapi-private-host>/api/jamora/admin/shipping/tracking/poll \
  -H 'content-type: application/json' \
  -H "x-jamora-admin-secret: $JAMORA_ADMIN_API_SECRET" \
  -H 'x-jamora-admin-actor: tracking-cron@jamora' \
  -H 'x-jamora-admin-role: owner' \
  --data '{"limit":25}'
```

Run one job at a time, keep the limit at or below 100, and alert on nonzero
failure counts. Selection is oldest-attempt-first and every attempt records its
time, including timeout/failure. Webhook and poll observations use the same
row-locked monotonic transition service.

### Reverse proxy and public tracking rate limits

Set `TRUST_PROXY=true` only when the controlled reverse proxy is the sole path
to both Next and Strapi, direct public ports are blocked, and the proxy
overwrites (does not append browser values for) `X-Real-IP`,
`X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Forwarded-Host`.

With `TRUST_PROXY=true`, the browser-facing tracking limiter isolates clients
using proxy-overwritten `X-Real-IP`. With `TRUST_PROXY=false`, spoofed forwarded
headers are ignored and direct clients intentionally share one secure bounded
BFF bucket. The BFF consumes the bucket before parsing `q` or `access`; missing
or malformed spray therefore cannot reach Strapi. A `429` must include
`Retry-After`. All limiter stores are single-process/in-memory; use a reviewed
shared limiter before scaling either service horizontally.

### Legacy tracking capability reissue

Legacy order-number/AWB links stay unavailable until an explicit reissue. There
is no compatibility switch. The owner-only operation:

```bash
curl --fail-with-body -X POST \
  https://<storefront-private-host>/admin/api/shipping/tracking/capabilities/reissue \
  -H 'content-type: application/json' \
  -H '<authenticated-owner-session-cookie>' \
  --data '{"limit":25}'
```

The result contains counts only: `selected`, `reissued`,
`skippedIneligible`, `skippedConcurrent`, and `remainingMissing`. Internally
each eligible order receives independent 32-byte random `trk_` entropy; Strapi
atomically stores its SHA-256 digest and same-origin private preview URL only if
the digest is still absent. The job records actor/order/time/outcome plus a
batch aggregate, never the raw capability.

Only active, email-verified accounts whose account/email binding matches the
order are eligible. Their authenticated customer BFF can read their own links
from `GET /api/jamora/shipping/tracking/links`. Guest legacy orders remain
fail-closed until a reviewed verified-email delivery workflow exists. Rotation/
revocation means issuing a new independent capability and replacing the stored
digest/URL; never derive it from order number, AWB, email, or another secret.
Run bounded batches until the before/after missing count is understood, review
all skip/concurrent audits, and retry only skipped rows.

### Romanian privacy and retention

Shipping addresses and phone numbers are fulfillment personal data. Collect
only recipient, phone, county, locality, postal code, street/building/unit, and
necessary delivery instructions. Do not store suggestion search text,
confidence/provider payloads, raw webhook bodies, capabilities, label bytes, or
carrier credentials in analytics/logs. Restrict full addresses and labels to
owner/warehouse operational roles; public tracking contains no customer,
address, item, or price data.

Define and enforce a Romanian/EU retention schedule with the data controller:
retain order/invoice fields required by law, but delete/anonymize optional
delivery instructions and operational payloads once no longer necessary.
Handle access/deletion requests without altering immutable financial,
membership-credit, payment-event, shipment-event, or audit records that must be
retained; use documented redaction where legally permitted.

### Rollout and rollback

Recommended order:

```dotenv
ADDRESS_ASSIST_ENABLED=true
SHIPPING_ENABLED=false
```

After address smoke, quote/payment/warehouse/provider smoke, and backup
verification:

```dotenv
ADDRESS_ASSIST_ENABLED=true
SHIPPING_ENABLED=true
```

Rollback shipping by setting `SHIPPING_ENABLED=false` in Strapi and storefront
and restarting both. Manual structured Romanian address and Phase 2 payments
remain available. Disable suggestions separately with
`ADDRESS_ASSIST_ENABLED=false`. Do not delete shipments/events, clear
capability hashes, roll back immutable ledgers, or reuse provider event IDs.

### Mandatory Phase 3 dev-server smoke

Run the repository gate first from a clean checkout (no Docker required):

```bash
cd jamora-web
npm test
npm run lint
npm run build
cd ../jamora-strapi
npm test
npm run build
```

Then use the deployed dev server with real PostgreSQL and its HTTPS proxy. This
checklist is a production release blocker:

1. **Migration and flags:** record missing-capability counts and schema/index
   checks. With both Phase 3 flags false, verify address suggestion, quote,
   shipment, label, webhook, poll, customer-link, and reissue routes are hidden;
   complete an ordinary Phase 2/manual structured-address checkout.
2. **Address:** enable address assistance. Using both a verified customer and a
   live guest reservation, request `Memorandumului`; confirm at most eight safe
   suggestions. Select one, manually change street/building, and assess a
   mismatched locality. Confirm edits persist and warnings remain visible.
   Reject non-JSON, oversized, control-character, and missing/expired guest
   capability requests.
3. **Quote/select:** enable shipping, request standard/express quotes for a
   published weighted product, and select one for guest, customer, and
   membership checkout. Confirm RON minor units, 15-minute expiry,
   address/items binding, customer-paid member shipping, idempotent replay, and
   rejection of forged/expired carrier/service/price/weight/zone.
4. **Payment settlement:** prepare guest, customer, and membership orders.
   Before a verified receipt/callback they must remain pending and create no
   shipment. Settle each through the Phase 2 verified path; confirm the stored
   shipping snapshot is revalidated and stock/credits settle exactly once.
5. **Warehouse/label:** verify unpaid, unpacked, foreign-order, and duplicate
   shipment requests fail. As warehouse, complete the checklist, create one
   shipment, issue PDF and ZPL capabilities, and download through the BFF.
   Confirm forged, foreign-shipment, expired, superseded, and replayed
   capabilities fail; responses contain no provider URL/reference/credential.
6. **Webhook:** send a freshly signed canonical `picked_up`, then
   `in_transit`, duplicate, stale regression, `exception`, recovery, and
   terminal event. Confirm append-only events, exact replay idempotency,
   changed replay conflict, foreign AWB failure, bad/old HMAC rejection, and no
   state regression. Inspect logs to confirm no raw body/secret/capability.
7. **Polling:** make the mock/staging adapter return unchanged, applied,
   replayed, failed, and timed-out observations. Trigger an owner batch at
   limits 1 and 100; confirm fairness, bounds, attempt timestamps, failure
   isolation, sanitized startup logs, and the same state semantics as webhook.
8. **Public tracking:** missing/malformed capability, order-only, and AWB-only
   requests return the same generic not-found surface. A valid secure link
   exposes only order status plus the minimal shipment timeline. Run the legacy
   reissue at limit 1, verify aggregate/per-order audits contain no `trk_`,
   confirm verified customer retrieval, and confirm ineligible guest rows stay
   unavailable.
9. **BFF ingress limit:** with a temporary 30/minute limit, send 31
   missing/malformed requests to
   `/api/jamora/orders/track?q=&access=bad`; request 31 must be `429` with
   `Retry-After` and Strapi must show zero upstream tracking calls. With
   `TRUST_PROXY=true`, send separate proxy-overwritten `X-Real-IP` values and
   confirm two clients have isolated buckets. With `TRUST_PROXY=false`, spoof
   `X-Real-IP`/`X-Forwarded-For` values and confirm they cannot split the shared
   direct-mode bucket.
10. **Rollback:** disable shipping and restart both applications. Confirm all
    provider/admin shipping surfaces disappear while manual structured address,
    Phase 2 payment, existing order data, and immutable shipment/event history
    remain intact. Re-enable only after the smoke evidence and rollback restore
    point are attached to the release record.

Do not promote Phase 3 without dated evidence for all ten items.
