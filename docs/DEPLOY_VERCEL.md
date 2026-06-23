# Deploying to Vercel

This app is a standard Next.js 15 (App Router) project with Prisma + PostgreSQL.
It is configured to build and migrate on Vercel with no Docker required.

What happens on each deploy (from the `build` script):

```
prisma generate        # generates the typed DB client
prisma migrate deploy   # applies any pending migrations to the database
next build              # builds the app
```

---

## Step 1 — Get the code into a Git repo

Push this project to GitHub/GitLab/Bitbucket (Vercel deploys from a Git repo).

```bash
git init
git add .
git commit -m "Commission Tracker"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

> `.env` is gitignored. Never commit real secrets.

---

## Step 2 — Create the Postgres database

You need a PostgreSQL database reachable from Vercel. Easiest is the Vercel
Postgres / Neon integration, but any managed Postgres works (Neon, Supabase, RDS).

You will end up with **two** connection strings:

- a **pooled** URL → used at runtime (`DATABASE_URL`)
- a **direct / unpooled** URL → used for migrations (`DIRECT_URL`)

**Using the Vercel Postgres (Neon) integration:**
1. In your Vercel project: **Storage → Create Database → Postgres**, and connect it
   to the project.
2. The integration injects connection variables automatically. Map them to the two
   names this app expects (Step 3): point `DATABASE_URL` at the **pooled** string
   and `DIRECT_URL` at the **unpooled** string (Neon exposes this as
   `DATABASE_URL_UNPOOLED`).

If your provider only gives one URL, set both `DATABASE_URL` and `DIRECT_URL` to
that same value.

---

## Step 3 — Set environment variables

In Vercel: **Project → Settings → Environment Variables**. Add these for the
Production (and Preview, if you use it) environments. See `.env.example` for the
full annotated list.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Pooled Postgres connection (runtime). |
| `DIRECT_URL` | yes | Direct/unpooled Postgres connection (migrations). |
| `SESSION_SECRET` | yes | `openssl rand -base64 32`. Signs the session cookie. |
| `APP_ENCRYPTION_KEY` | yes | `openssl rand -base64 32`. Encrypts private notes. |
| `BASE_URL` | recommended | Your `https://...vercel.app` (or custom) URL. |
| `NEXT_PUBLIC_APP_NAME` | optional | App display name. |
| `ADMIN_EMAIL` | for seeding | First admin login (e.g. `adrianr@eggersesearch.com`). |
| `ADMIN_NAME` | for seeding | First admin's name. |
| `ADMIN_PASSWORD` | for seeding | Long random password; change after first login. |
| `ALLOW_SAMPLE_DATA` | optional | `true` to seed a sample recruiter; leave blank in prod. |
| `LOXO_WEBHOOK_SECRET` | optional | Enables the Loxo placement webhook. |
| `DEFAULT_LOXO_RECRUITER_ID` | optional | Fallback recruiter for unmatched Loxo payloads. |

Generate the two secrets locally:

```bash
openssl rand -base64 32   # SESSION_SECRET
openssl rand -base64 32   # APP_ENCRYPTION_KEY
```

---

## Step 4 — Deploy

Import the repo in Vercel (**Add New → Project**) and deploy. Vercel auto-detects
Next.js. No build/output overrides are needed — the `build` script already runs
`prisma generate && prisma migrate deploy && next build`.

The first deploy creates all tables via `prisma migrate deploy`.

---

## Step 5 — Create the first admin (seed)

Migrations create the tables but not the first login. Seed it once against the
production database from your machine:

```bash
# Pull the deployed env vars (incl. DATABASE_URL/DIRECT_URL) into .env.local
vercel env pull .env.local

# Load them and seed
set -a; . ./.env.local; set +a
npm install
npm run db:seed
```

This uses `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD` to create the admin user
(and, if `ALLOW_SAMPLE_DATA=true`, a sample recruiter + plan + two paid placements).

Then open the app, sign in with those admin credentials, and change the password.

> Alternatively, run the seed locally pointed at the prod DB by exporting
> `DATABASE_URL`, `DIRECT_URL`, `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`,
> `APP_ENCRYPTION_KEY` yourself, then `npm run db:seed`.

---

## Step 6 — Verify

- Visit `/api/health` → should return `{ "ok": true, "database": "ok" }`.
- Visit `/settings` after signing in → the checklist should show the required
  items as Configured.

---

## Step 7 — (Optional) Loxo webhook

If you want placements created automatically from Loxo:

1. Set `LOXO_WEBHOOK_SECRET` in Vercel (and on the Loxo / middleware side).
2. Point the webhook at `https://<your-app>/api/loxo/webhook`.
3. Each request must include an `x-loxo-signature` header containing the
   HMAC-SHA256 hex digest of the raw request body, signed with that secret.
4. Include a recruiter email in the payload (e.g. `recruiter.email`) or set
   `DEFAULT_LOXO_RECRUITER_ID` so the placement can be attributed.

Webhook events are deduplicated and recorded; failures are logged in the audit
trail.

---

## Future deploys

Just push to your main branch. Vercel rebuilds, re-runs `prisma migrate deploy`
(applying any new migrations), and ships. Seeding is a one-time step.

---

## Local development (optional)

```bash
cp .env.example .env          # then fill in values
docker compose up -d db        # local Postgres on :5432
# point DATABASE_URL and DIRECT_URL at the local db, then:
npm install
npm run db:dev -- --name init  # create/apply migrations locally
npm run db:seed
npm run dev                    # http://localhost:3000
npm run test                   # commission engine tests
npm run typecheck              # TypeScript check
```

---

## Notes / known limitations

- **Login rate limiting is in-memory.** On serverless it is per-instance and resets
  on cold starts. For strict brute-force protection across instances, back it with
  a shared store (e.g. Upstash Redis). It is not a correctness issue.
- **Migrations run during build.** This needs `DIRECT_URL` reachable from Vercel's
  build step (it is, for managed Postgres). If you prefer, remove
  `prisma migrate deploy` from the `build` script and run migrations as a separate
  deploy step instead.
