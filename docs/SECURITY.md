# Security model

This app stores compensation and placement data, so assume every record is sensitive.

## Access control

- `RECRUITER`: can view only the recruiter profile linked to their user account.
- `OWNER` and `ADMIN`: can view and manage all recruiter records.
- Every server-side query checks the current session before returning recruiter-specific data.
- The UI hiding a link is never treated as security; server code enforces access.

## Session security

- Sessions are stored in HTTP-only cookies.
- Cookies are HMAC-signed with `SESSION_SECRET`.
- Cookies are `Secure` in production and `SameSite=Lax`.
- Session lifetime is 10 hours by default.

## Encryption

Placement notes and adjustment reasons are encrypted with AES-256-GCM using `APP_ENCRYPTION_KEY`.

Do not rotate `APP_ENCRYPTION_KEY` unless you also build a migration that decrypts old records with the old key and re-encrypts them with the new key.

## Loxo webhook

- The endpoint requires `x-loxo-signature`.
- The signature is HMAC SHA-256 over the raw request body using `LOXO_WEBHOOK_SECRET`.
- The app stores a payload hash and minimal mapped fields, not the full raw payload.
- Webhook events are idempotent by `externalId`.

## Operational requirements

- Use HTTPS only.
- Use a managed database with backups.
- Restrict database access by network and credentials.
- Keep `.env` out of Git.
- Consider placing this behind company SSO/MFA before giving the whole team access.
- Review audit logs after payroll changes.
- Never upload the real Excel workbook into the repository.
