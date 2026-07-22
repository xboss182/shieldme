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
1. Keep `MAILBABY_DSN_VERIFIED=false` until a controlled owner-address bounce is received at the SMTP ingress address `b+<token>@sm-bounces.<platform-domain>`.
2. The ingress validates only the opaque token hash, marks the matching MailBaby mail log `bounced`, and suppresses its verified forwarding recipient. It never persists the DSN body.
3. Set the gate to `true` only after that controlled test confirms the matching suppression entry. Unknown, expired, or malformed tokens are rejected.

## Backups
- Run `scripts/backup-db.sh` with `DATABASE_URL` set.
- Retain daily backups for 30 days and monthly backups for 1 year.
- Verify every backup with `scripts/verify-restore.sh <dump>` and periodically restore into a disposable database.

## Security events
- `GET /api/admin/security-events` returns recent security audit events.
- Monitor failed logins, locked accounts, webhook verification failures, admin actions, rate-limit events, and kill-switch toggles.
