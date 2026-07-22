# Alias Forwarder Security Runbook

## Secrets
- `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`.
- Secrets are loaded from runtime environment only. Do not commit `.env` files.
- Rotate JWT secrets by setting new values, restarting PM2, and requiring users to log in again.

## Resend API key rotation without downtime
1. Add the new key through the authenticated admin config endpoint (`POST /api/admin/config`).
2. Send a test message and verify delivery logs.
3. Revoke the old key in Resend.
4. Persist the new key in the PM2/runtime environment and `pm2 save`.

## MailBaby forwarding DSNs
1. Keep `MAILBABY_DSN_VERIFIED=false` until provider-supported, cryptographically authenticated DSN provenance is available and independently verified.
2. `MAILBABY_DSN_VERIFIED=true` permits outbound submission only. It never enables MailBaby recipient suppression: this SMTP ingress has no repository-proven MailBaby DSN authentication contract.
3. Automatic suppression accepts only a bounded `multipart/report; report-type=delivery-status` terminal failure from an IP in `SMTP_DSN_TRUSTED_SOURCE_IPS`, for a `custom_smtp` message with null envelope sender and matching original/final recipient. Delays, malformed messages, replays, wrong recipients, and untrusted sources do not suppress. It never persists the DSN body.
4. Do not list MailBaby IPs in `SMTP_DSN_TRUSTED_SOURCE_IPS`; enable automatic MailBaby suppression only after a provider-authenticated callback or documented source-verification contract is implemented and independently reviewed.

## Development dependency audit
`npm audit --audit-level=moderate` reports four moderate findings only in development tooling: `drizzle-kit` depends on `@esbuild-kit/esm-loader`, which embeds vulnerable `esbuild <=0.24.2`. The current compatible `drizzle-kit` release retains this chain; the audit suggestion downgrades to `0.18.1`, which is not a safe upgrade. Production installs exclude development dependencies, and `npm run audit` must remain clean. Reassess when Drizzle removes the dependency or publishes a compatible fixed release.

## Backups
- Run `scripts/backup-db.sh` with `DATABASE_URL` set.
- Retain daily backups for 30 days and monthly backups for 1 year.
- Verify every backup with `scripts/verify-restore.sh <dump>` and periodically restore into a disposable database.

## Security events
- `GET /api/admin/security-events` returns recent security audit events.
- Monitor failed logins, locked accounts, webhook verification failures, admin actions, rate-limit events, and kill-switch toggles.
