# Security operations

## Secrets
Required production secrets: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `RESEND_WEBHOOK_SECRET`. Optional runtime-configured secret: Resend API key. `ADMIN_SECRET` is deprecated and should only remain temporarily for break-glass migration; normal admin access uses per-operator admin JWT accounts.

Rotate JWT secrets by deploying new secrets and forcing session logout/re-login. Rotate Resend API keys through the admin config endpoint; the API/worker read shared runtime config and do not require downtime.

## Backups
Run `scripts/backup-db.sh` with `DATABASE_URL` set. It writes gzip-compressed `pg_dump`, validates gzip integrity, writes sha256, and prunes backups older than 30 days. Verify a backup with `scripts/verify-restore.sh <backup>`; set `RUN_RESTORE=true` and `RESTORE_TEST_DATABASE_URL` to perform an actual restore into an isolated test database.

## Redis persistence
Run `scripts/check-redis-persistence.sh` and verify either RDB `save` rules or AOF `appendonly yes` is configured for the deployment Redis.

## Security events
Structured events are logged and persisted to audit logs with `metadata.securityEvent=true`. Admins can inspect the last 24h via `GET /api/admin/security-events`.
