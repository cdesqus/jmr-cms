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
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
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
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port 443;
    }

    location ^~ /uploads {
        proxy_pass http://192.168.18.204:9014;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port 443;
    }

    location ^~ /content-manager {
        proxy_pass http://192.168.18.204:9014;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port 443;
    }

    location ^~ /content-type-builder {
        proxy_pass http://192.168.18.204:9014;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port 443;
    }

    location ^~ /upload {
        proxy_pass http://192.168.18.204:9014;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port 443;
    }

    location ^~ /users-permissions {
        proxy_pass http://192.168.18.204:9014;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
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
node --test --test-force-exit src/api/**/*.test.mjs scripts/package-runtime-cjs.test.mjs
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

`PAYMENTS_ENABLED` and `ROPAY_ENABLED` accept only exact lowercase `true`.
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
proxy before the storefront catch-all and retain forwarded client IP headers so
the pre-verification request guard can rate limit correctly. Preserve the
4096-byte callback body limit; do not strip the three RoPay headers.

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
node --test --test-force-exit src/api/**/*.test.mjs scripts/package-runtime-cjs.test.mjs
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
