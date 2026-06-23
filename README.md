# Commission Tracker

A secure recruitment commission tracker for draw-against-commission plans. It
replaces the per-recruiter commission spreadsheet with a web dashboard: logins and
roles, per-recruiter privacy, configurable commission rules, an audit trail, and an
optional Loxo webhook that creates placements automatically.

Built with Next.js 15 (App Router), Prisma, and PostgreSQL. Configured to deploy on
**Vercel** with migrations applied automatically at build time.

## Documentation

- **`docs/USER_GUIDE.md`** — what it does, how the commission math works, how it
  helps Adrian, and how to use each screen.
- **`docs/DEPLOY_VERCEL.md`** — step-by-step Vercel deployment.
- **`docs/CONFIGURATION.md`** — environment variables and launch checklist.
- **`docs/SECURITY.md`** — access control, sessions, encryption, webhook security.
- **`docs/SPREADSHEET_MAPPING.md`** — how each spreadsheet concept maps to the app
  and how the engine reproduces the spreadsheet's math.

## What it does

- Secure login with a signed, HTTP-only session cookie.
- Roles: `ADMIN`, `OWNER`, `RECRUITER`. Recruiters see only their own numbers.
- Commission engine reproducing the source spreadsheet:
  - annual goal tracking and commission rate per recruiter/year,
  - salary/draw per pay period (semi-monthly, bi-weekly, or monthly),
  - monthly payout (default 90% of commission after draw recovery), with the
    held-back remainder preserved through dry months,
  - quarterly true-up that releases the positive balance,
  - payout overrides for splits and manual adjustments.
- Private notes encrypted (AES-256-GCM) before storage.
- Loxo webhook with HMAC verification and idempotent, minimal placement storage.
- Audit log of sign-ins and administrative changes.
- PWA manifest so it can be installed on phones from the browser.

## Deploy (short version)

1. Push this repo to Git.
2. Create a managed PostgreSQL database; get a pooled and a direct URL.
3. In Vercel, set the environment variables from `.env.example` (`DATABASE_URL`,
   `DIRECT_URL`, `SESSION_SECRET`, `APP_ENCRYPTION_KEY`, admin seed vars, etc.).
4. Deploy. The build runs `prisma generate && prisma migrate deploy && next build`.
5. Seed the first admin once: `vercel env pull .env.local`, load it, then
   `npm run db:seed`. Sign in and change the password.

Full details: `docs/DEPLOY_VERCEL.md`.

## Local development

```bash
cp .env.example .env            # fill in values
openssl rand -base64 32         # SESSION_SECRET
openssl rand -base64 32         # APP_ENCRYPTION_KEY
docker compose up -d db          # local Postgres on :5432
npm install
npm run db:dev -- --name init    # apply migrations locally
npm run db:seed                  # create admin (+ optional sample data)
npm run dev                      # http://localhost:3000
```

## Commands

```bash
npm run dev          # local dev server
npm run build        # prisma generate + migrate deploy + next build (Vercel build)
npm run build:local  # prisma generate + next build (no migrate)
npm run start        # start built app
npm run db:dev       # local migration workflow (prisma migrate dev)
npm run db:migrate   # apply migrations (prisma migrate deploy)
npm run db:seed      # create initial admin / optional sample data
npm run test         # commission engine unit tests
npm run typecheck    # TypeScript check
```

## Commission math, in one paragraph

Each draw (salary per pay period) is an advance against commission, so it lowers a
running balance. Paid placements earn `bill x rate` (or a payout override for
splits). In a month with commission, the recruiter is paid the monthly rate
(default 90%) of that month's commission after recovering the month's draw; the
rest is held back in the balance. Dry months release nothing. At each quarter's
end, any positive balance is paid out (the true-up); a negative balance (unrecovered
draw) carries forward. See `docs/USER_GUIDE.md` for the full explanation and
`src/lib/commission-engine.test.ts` for the tests that pin this behavior.

## Notes

- Do not commit `.env` or the real Excel workbook.
- Keep `SESSION_SECRET`, `APP_ENCRYPTION_KEY`, and database URLs in Vercel's
  environment settings.
- Reconcile the app's ledger against a few real spreadsheet months before using it
  for an actual payroll run.
