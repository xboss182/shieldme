# Business Continuity / Disaster Recovery Plan

## Targets
- RTO: restore core API/forwarding within 8 hours for critical outage.
- RPO: maximum 24 hours of data loss, bounded by backup schedule.

## Critical services
PM2 services: `alias-forwarder`, `shieldme-smtp`, `shieldme-worker`, `shieldme-site`. Dependencies: PostgreSQL, Redis, Cloudflare DNS/TLS, Resend.

## Backups
Run `scripts/backup-db.sh` daily. Verify backup integrity with sha256 and restore test using `scripts/verify-restore.sh` at least monthly.

## Recovery outline
Provision VPS, install Node/Postgres/Redis/PM2/Caddy, restore database backup, restore runtime config/secrets from secure store, build backend/frontend, restart PM2, verify health and mail flow.
