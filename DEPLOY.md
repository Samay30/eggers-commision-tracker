# Eggers Internal — Deploy to Vercel

This is the full standalone app: commission tracking + the company/team/individual
goal dashboard (billing, interviews, phone time), the hub, Ringover and Loxo
syncs, and PWA install support. It is a standard Next.js 15 app and deploys to
Vercel with no special build steps.

## 1. Database
Create a Postgres database (Vercel Postgres or Neon). You need two connection
strings: a pooled one (`DATABASE_URL`) and a direct one (`DIRECT_URL`, used for
migrations). Both go in the env vars below.

## 2. Push to a Git repo and import into Vercel
- Framework preset: Next.js (auto-detected).
- Build command: leave default. `package.json`'s build script runs
  `prisma generate && prisma migrate deploy && next build`, so the schema
  (including the new goals/activity tables) migrates automatically on every deploy.
- Install command: default (`npm install`).

## 3. Environment variables
Copy `.env.example` into Vercel → Settings → Environment Variables (Production).
Generate secrets with `openssl rand -hex 32`. At minimum set: `DATABASE_URL`,
`DIRECT_URL`, `SESSION_SECRET`, `APP_ENCRYPTION_KEY`, `BASE_URL`, the admin vars,
and `CRON_SECRET`. Add `LOXO_*` and `RINGOVER_API_KEY` when you connect those.

> If you previously shared any Loxo/webhook secret in chat, rotate it before go-live.

## 4. First deploy + seed the admin
After the first successful deploy, create the first admin and (optionally) the
team. From a machine with the production env vars:

    npm run onboard        # see ENV_AND_SETUP.md for details

## 5. Connect data sources
- **Loxo placements (realtime):** point Loxo's placement webhook at
  `https://<your-app>/api/loxo/webhook` with `LOXO_WEBHOOK_SECRET`.
- **Loxo placements (backfill):** Integrations page → "Sync placements".
- **Ringover phone time & Loxo interviews:** Integrations page buttons, or let
  the scheduled job handle it (next step).

## 6. Scheduled activity sync (already wired)
`vercel.json` registers an hourly cron on `/api/activity/sync`. Vercel attaches
`Authorization: Bearer $CRON_SECRET` automatically, which the route verifies, so
just make sure `CRON_SECRET` is set. It syncs Ringover phone time and Loxo
interviews for the current year. Everything is an idempotent upsert.

## 7. Set goals
Sign in as an admin → **Goals**. Set the company billing/interview/phone goals and
each recruiter's interview and phone targets. Individual billing goals continue to
live on each recruiter's commission plan.

## 8. Install on phones
Open the app, sign in, and use the browser's "Add to Home Screen". It installs
with the EES icon and opens full screen. The service worker never caches
authenticated pages or API responses, so no comp data is stored on the device.

## Two integration files to verify once (same as the existing Loxo mapping)
- `src/lib/ringover/mapping.ts` — confirm call field names against one real call.
- `src/lib/loxo/interviews.ts` — confirm the activity path + interview keywords.
Both fail safe: anything unmatched is skipped, never misattributed, and the
dashboard shows "no goal / —" until real data and targets exist.
