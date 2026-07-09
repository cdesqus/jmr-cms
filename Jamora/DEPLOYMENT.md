# Jamora - Deployment & Production Checklist

Jamora is a two-app system:

| App | Path | What it is | Runtime |
| --- | --- | --- | --- |
| **Storefront** | [jamora-web/](jamora-web/) | Customer-facing Next.js site | Node / Edge (Vercel) |
| **Backend / CMS** | [jamora-medusa/](jamora-medusa/) | Medusa commerce engine + Admin dashboard | Node server + Postgres |

The storefront reads products, prices, and inventory from the Medusa **Store API**.
The Admin dashboard (your CMS) is served by the Medusa backend.

---

## Deploy with Docker Compose (Linux dev server)

The whole stack is containerised: **Postgres + Redis + Medusa + storefront**. Files:
[docker-compose.yml](docker-compose.yml), [.env.example](.env.example),
[jamora-medusa/apps/backend/Dockerfile](jamora-medusa/apps/backend/Dockerfile),
[jamora-web/Dockerfile](jamora-web/Dockerfile).

```bash
# on the Linux server, from the repo root
cp .env.example .env
# edit .env: set strong JWT_SECRET & COOKIE_SECRET (openssl rand -hex 32),
# the admin password, and the CORS URLs to your server's address.

docker compose up -d --build          # builds & starts all 4 services
```

On first boot the Medusa container automatically runs migrations, seeds the 6
Jamora products, creates the admin user, and creates the storefront publishable
API key. The storefront auto-discovers that key from the backend, so no
copy-paste from logs is required.

**Access:**

- Storefront -> `http://<server>:3095`
- Admin / CMS -> `http://<server>:9014/app` (login = `MEDUSA_ADMIN_EMAIL` / `MEDUSA_ADMIN_PASSWORD`)

### Notes

- `MEDUSA_PUBLISHABLE_KEY` is optional in Docker Compose. If it is blank, the
  storefront asks Medusa for the active Jamora publishable key at runtime. If you
  set it, the env var wins as a manual override.
- If the backend or key lookup is unavailable, the storefront serves its built-in
  mock catalogue, so the site is never down.
- Set `STORE_CORS` / `ADMIN_CORS` / `AUTH_CORS` to your real hostnames (e.g.
  `http://203.0.113.10:3095`) or the admin login and storefront API calls will be
  blocked by CORS.
- Redis is wired in (`REDIS_URL`) so the cache / event bus / workflow engine are
  durable, not the in-memory dev defaults.
- Data persists in the `pgdata` / `redisdata` named volumes across restarts.
- Put a reverse proxy (Caddy / Nginx / Traefik) in front for TLS + real domains
  when you move past the dev server.
- On the first boot, Medusa migrations and seeding can take several minutes before
  the backend health endpoint is available. Use `docker compose logs -f medusa`
  to watch progress. The entrypoint logs schema migrations and Jamora seed as
  separate steps, runs migrations from the `.medusa/server` production build, and
  disables Redis only for CLI migration steps so Redis runtime clients do not keep
  the migration process open.

Handy: `docker compose ps` | `docker compose logs -f medusa` | `docker compose down`
(add `-v` to also wipe the database volumes).

Troubleshooting Postgres password errors:

```bash
# Symptom in Medusa logs:
# password authentication failed for user "postgres"

# For a fresh/dev deployment where stored data can be deleted:
docker compose down -v
docker compose up -d --build
```

Postgres only applies `POSTGRES_PASSWORD` when the `pgdata` volume is first
created. If you change `POSTGRES_PASSWORD` later while keeping the old volume,
Medusa will use the new `.env` password but Postgres will still expect the old
one. For existing data you must either restore the old `.env` password or log in
with the old password and run `ALTER USER postgres WITH PASSWORD 'new-password';`.

Troubleshooting the publishable key:

```bash
# Confirm the auto-discovery endpoint sees a key:
curl http://localhost:9014/jamora/storefront-config

# Or inspect it directly in Postgres:
docker compose exec postgres psql -U postgres -d jamora_medusa \
  -c "select title, token, revoked_at from api_key where type = 'publishable';"
```

---

## Local development (without Docker)

```bash
# 1. Database (Docker) - start once
docker start jamora-postgres        # created during setup; run `docker ps` to confirm

# 2. Backend / CMS
cd jamora-medusa/apps/backend
npm run dev                          # API + Admin at http://localhost:9000
# Admin dashboard: http://localhost:9000/app

# 3. Storefront (separate terminal)
cd jamora-web
npm run dev                          # http://localhost:3000
```

### Accessing the CMS (admin dashboard)

- URL: **http://localhost:9000/app**
- Create/replace an admin user any time:
  ```bash
  cd jamora-medusa/apps/backend
  npx medusa user --email you@jamora.eu --password "a-strong-password"
  ```
- Everything merchandising lives there: products, variants, **EUR prices**, inventory,
  orders, customers, discounts, regions, and tax. Changes appear on the storefront
  immediately (it fetches live from the Store API).

---

## Going to production - the pieces that are NOT code

The code is production-grade, but a live store additionally needs these external
accounts and services. This is the honest gap between "runs locally" and "charging
real cards."

### 1. Managed Postgres

- Use a managed provider (Neon, Supabase, Railway, RDS). Never self-manage the DB for a store.
- Set `DATABASE_URL` on the backend host to the managed connection string.

### 2. Host the Medusa backend

- Deploy `jamora-medusa/apps/backend` to a Node host (Railway, Render, a VPS, or Medusa Cloud).
- Required env: `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET` (generate strong new values;
  the local defaults are `supersecret`), `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`.
- Add **Redis** for production (`REDIS_URL`) and configure the cache / event-bus / workflow-engine
  modules. The in-memory defaults are dev-only and do not survive restarts or scale.
- Run migrations on deploy: `npx medusa db:migrate`.

### 3. Payments (real money)

- Create a **Stripe** (or Adyen) account; add the Stripe payment module to `medusa-config.ts`
  with `STRIPE_API_KEY` + webhook secret.
- Enable EU methods in Stripe: cards, iDEAL, Bancontact, Klarna, Apple/Google Pay.
- The storefront's checkout button is currently a stub. Wire it to Medusa's cart,
  payment-session, and Stripe flow once the module is configured.

### 4. Tax / VAT

- Configure EU tax regions in the Admin (per-country VAT). Medusa handles VAT-inclusive
  pricing and tax lines; enable automatic tax or a tax provider.

### 5. Host the storefront

- Deploy `jamora-web` to Vercel.
- Env: `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (the deployed backend URL). You may also set
  `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` from Admin -> Settings -> Publishable API Keys
  as an explicit override.
- Point `STORE_CORS` on the backend at the storefront's production domain.

### 6. Everything else

- Domain + DNS + TLS.
- Transactional email (order confirmations, the contact form) via Resend / Postmark.
  Swap the `console.info` in [jamora-web/src/app/api/contact/route.ts](jamora-web/src/app/api/contact/route.ts).
- Privacy-friendly analytics (Plausible / Matomo), honoring the existing granular cookie consent.
- Backups for Postgres and an uptime monitor.

---

## Production readiness status

| Area | Status |
| --- | --- |
| Storefront UI (home, shop, product, cart, contact, about) | Built |
| Granular GDPR cookie consent | Built |
| Commerce backend + Admin CMS (products, orders, inventory) | Running locally |
| EUR region / pricing | Configured |
| Storefront reads live CMS data | Wired |
| Real checkout / payments (Stripe) | Needs Stripe account + module |
| Hosting, domain, managed DB, Redis, email | Needs infra + accounts |
