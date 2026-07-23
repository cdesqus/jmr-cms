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
