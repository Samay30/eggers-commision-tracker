# Loxo integration + onboarding — setup

## 1. Environment variables (add in Vercel → Production, and your local .env)

    LOXO_API_KEY=<your Loxo API key>            # ROTATE the one shared in chat first
    LOXO_AGENCY_SLUG=eggers-executive-search
    LOXO_DOMAIN=app.loxo.co
    LOXO_WEBHOOK_SECRET=<generate-a-random-hex-string>
    LOXO_SYNC_SECRET=<generate-a-random-hex-string>
    # Optional fallback if a placement has no matching recruiter email:
    # DEFAULT_LOXO_RECRUITER_ID=<recruiter id>
    # Optional override if placements aren't at /placements (inspect script tells you):
    # LOXO_PLACEMENTS_PATH=placements

No database migration is required — fee details ride in the existing Placement.metadata column.

## 2. File placement (drop-in, paths relative to repo root)

New files:
- src/lib/loxo/fee.ts
- src/lib/loxo/client.ts
- src/lib/loxo/mapping.ts        <-- the ONE file to verify field names in
- src/lib/loxo/sync.ts
- src/app/loxo-actions.ts
- src/app/integrations/page.tsx
- src/app/api/loxo/sync/route.ts
- scripts/onboard.ts
- scripts/loxo-inspect.ts

Replace existing:
- src/app/api/loxo/webhook/route.ts
- src/components/AppShell.tsx
- src/app/recruiters/[id]/page.tsx
- package.json  (adds "onboard" and "loxo:inspect" scripts — add these two lines if you prefer not to replace the file)

## 3. Confirm Loxo field names (do this before trusting numbers)

    LOXO_API_KEY=... LOXO_AGENCY_SLUG=eggers-executive-search npm run loxo:inspect

Match the printed keys to the lists in src/lib/loxo/mapping.ts. Adjust if needed.

## 4. Onboard the team

    JASON_INITIAL_PASSWORD='<set-a-temporary-password>' npm run onboard

Prints each person's temporary password once. VERIFY the emails in scripts/onboard.ts
first — the login email must match each person's Loxo email or their placements won't
auto-attribute.

## 5. Webhook (realtime) in Loxo
Point Loxo's placement webhook to:  https://<your-app>/api/loxo/webhook
Signing secret: the LOXO_WEBHOOK_SECRET above. Header: x-loxo-signature: sha256=<hmac>

## 6. Backfill / reconcile
Admins: Integrations page → "Sync 2026 from Loxo now".
Cron (optional): GET https://<your-app>/api/loxo/sync?year=2026  header x-sync-secret: <LOXO_SYNC_SECRET>
