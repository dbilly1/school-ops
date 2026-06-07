# Deploying SchoolOps

Monorepo: **API** (`apps/api`, NestJS) + **Web** (`apps/web`, Next.js 16) + **DB**
(Supabase Postgres, currently `eu-west-1`).

## 0. The one rule that decides your performance

**Host the API in the same region as the database (EU / `eu-west-1`).** The API
makes several DB round-trips per request; if the API sits far from the DB, every
request pays that latency repeatedly. The web frontend can live anywhere (it's
served from a CDN) — only the **API ↔ DB** hop must be short.

Suggested split:
- **API** → Render (Frankfurt) / Railway (EU) / Fly.io (`ams`/`cdg`) — pick an EU region.
- **Web** → Vercel (best Next.js support) or the same host, EU region.
- **DB** → keep Supabase `eu-west-1` (no change).

## 1. API environment variables (server-side, runtime)

Copy every secret your local API already uses. Required:

| Var | Notes |
|-----|-------|
| `DATABASE_URL` | Supabase **pooler** URL (port 6543, `?pgbouncer=true`). Used by the app at runtime. |
| `DIRECT_URL` | Supabase **direct** URL (port 5432). Used for migrations only. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | staff auth |
| `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | token lifetimes |
| `JWT_PORTAL_SECRET`, `JWT_PORTAL_REFRESH_SECRET` | parent/student portal auth |
| `JWT_SUPER_ADMIN_SECRET`, `JWT_SUPER_ADMIN_REFRESH_SECRET` | platform admin auth |
| `BREVO_API_KEY`, `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME` | email |
| `APP_URL` | public web URL, e.g. `https://app.yourdomain.com` (used in emails) |
| `PUBLIC_HOLIDAYS_API_URL` | calendar holidays |
| `NODE_ENV` | `production` |
| **`CORS_ORIGINS`** | the web origin(s), comma-separated, e.g. `https://app.yourdomain.com` |
| **`CORS_ROOT_DOMAIN`** | `yourdomain.com` — allows any `*.yourdomain.com` subdomain (school logins) |

Port: the server now binds to `$PORT` (host-injected) → `API_PORT` → `4000`, on
`0.0.0.0`. Most hosts set `$PORT` automatically; nothing to configure.

Build/start (adapt to your host):
- Install at the repo root (pnpm workspace): `pnpm install --frozen-lockfile`
- Generate Prisma client (reads `prisma/schema.prisma`): `pnpm --filter @schoolops/api exec prisma generate`
- Build: `pnpm --filter @schoolops/api build` → output `apps/api/dist`
- Start: `node apps/api/dist/main.js`

## 2. Web environment variables (build-time — baked into the bundle!)

These are read by `next build`, so they must be set **before/at build time**, not
just at runtime:

| Var | Value |
|-----|-------|
| `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com/api` (note the `/api` suffix) |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `yourdomain.com` (so `<slug>.yourdomain.com` resolves the school) |

Do **not** set `NEXT_PUBLIC_DEV_SCHOOL_SLUG` in production — that's a localhost-only
shortcut; real subdomains supply the slug.

Build/start: standard Next (`next build` / `next start`). On Vercel, set the project
root to `apps/web`; it detects the pnpm workspace and installs from the root.

## 3. DNS — multi-tenant subdomain login

Schools log in at `<slug>.yourdomain.com`, so you need:
- A **wildcard DNS** record: `*.yourdomain.com` → your web host.
- **Wildcard TLS** (Vercel and most hosts issue this automatically for added wildcard domains).
- The API at its own host, e.g. `api.yourdomain.com`.

Quick single-school smoke test before wildcard DNS is ready: serve the web on one
host and temporarily build with `NEXT_PUBLIC_DEV_SCHOOL_SLUG=<a-real-slug>` to pin
one school. (`node prisma/list-slugs.js` lists existing slugs.)

## 4. Database / migrations

The hosted app points at your **existing** Supabase DB, so for a perf test no
schema change is needed. For real releases, switch from `prisma db push` to
migrations: `prisma migrate deploy` using `DIRECT_URL` (port 5432, not the pooler).

## 5. After deploy — sanity check

1. Open `https://app.yourdomain.com` in an **Incognito window** (extensions off — a
   browser extension was injecting `crxlauncher` and causing a hydration mismatch
   locally; that's client-side and will follow you to prod otherwise).
2. Log in; confirm data loads.
3. Watch the API logs: `METHOD /api/... — Xms` (the timing interceptor). These
   should be small now that the API is next to the DB. `TIMING_LOG=off` to silence;
   `PRISMA_LOG_QUERIES=1` to see per-query timing if anything looks slow.
