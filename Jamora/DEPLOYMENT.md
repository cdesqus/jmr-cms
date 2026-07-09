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
```

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

For disposable dev data:

```bash
docker compose down -v
docker compose up -d --build
```

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

- Stripe Checkout endpoint in `jamora-web`.
- Stripe webhook handling to record paid orders in Strapi.
- Domain + TLS via Caddy, Nginx, or Traefik.
- Transactional email for order confirmations.
- Regular Postgres backups.

No monthly CMS fee is required for this stack. You only pay for the server,
domain, payment processing, and any optional infrastructure you choose.
