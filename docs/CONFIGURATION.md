# Configuration checklist

> For a full Vercel walkthrough, see `docs/DEPLOY_VERCEL.md`.

## Environment variables

| Variable | Required | Example | Purpose |
|---|---:|---|---|
| `DATABASE_URL` | Yes | `postgresql://...` | Pooled PostgreSQL connection (runtime). |
| `DIRECT_URL` | Yes | `postgresql://...` | Direct/unpooled connection (migrations). Set equal to `DATABASE_URL` if your provider has no separate pooled URL. |
| `SESSION_SECRET` | Yes | output of `openssl rand -base64 32` | Signs login cookies. |
| `APP_ENCRYPTION_KEY` | Yes | output of `openssl rand -base64 32` | Encrypts sensitive notes. |
| `BASE_URL` | Recommended | `https://commissions.example.com` | Redirect/link base. |
| `ADMIN_EMAIL` | Seed only | `adrian@company.com` | Initial admin login. |
| `ADMIN_NAME` | Seed only | `Adrian` | Initial admin display name. |
| `ADMIN_PASSWORD` | Seed only | long random value | Initial admin password. |
| `ALLOW_SAMPLE_DATA` | No | `false` | Seeds sanitized demo recruiter when true. |
| `LOXO_WEBHOOK_SECRET` | For Loxo | long random value | Verifies webhook signatures. |
| `DEFAULT_LOXO_RECRUITER_ID` | Optional | recruiter id | Fallback recruiter mapping. |

## First production launch

1. Create production PostgreSQL database.
2. Add all required env vars in the hosting provider.
3. Deploy the app.
4. Run migrations. On Vercel this happens automatically during the build (`prisma migrate deploy`); for other hosts run `npm run db:migrate`.
5. Run seed once: `npm run db:seed`.
6. Log in as the initial admin.
7. Create/verify Adrian, Aaron, and any other admin/owner accounts.
8. Create recruiter accounts.
9. Configure annual plan for each recruiter.
10. Enter opening balances from the spreadsheet.
11. Enter or import paid placements.
12. Compare app output against the spreadsheet before using for real payout decisions.

## Loxo payload shape

The webhook mapper accepts flexible field names, but best results come from this shape:

```json
{
  "id": "loxo-placement-id",
  "status": "paid",
  "placementName": "Candidate → Client",
  "client": { "name": "Client Bank" },
  "candidate": { "name": "Candidate Name" },
  "recruiter": { "email": "recruiter@example.com" },
  "paymentDate": "2026-06-30",
  "startDate": "2026-06-15",
  "payDate": "2026-07-15",
  "billAmount": 35000,
  "note": "Optional private note"
}
```

Signature header:

```text
x-loxo-signature: sha256=<hex hmac sha256 of raw body>
```
