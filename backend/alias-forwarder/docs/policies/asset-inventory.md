# Asset Inventory

## Infrastructure
- VPS: `152.42.211.146` / `mnco-2vcpu-4gb-sgp1` hosts ShieldMe services, PostgreSQL on port 5433, Redis on 6379, Caddy, PM2.
- Backend: `/root/alias-forwarder`, PM2 `alias-forwarder`, API `https://api.shieldme.cc`.
- Frontend: `/var/www/shieldme`, PM2 `shieldme-site`, app `https://app.shieldme.cc`.
- Mail services: PM2 `shieldme-smtp` and `shieldme-worker`.
- Database: PostgreSQL `alias_forwarder` with users/domains/recipients/aliases/mail logs/audit logs/PGP metadata.
- Cache/queue: Redis for BullMQ forwarding jobs.

## Third parties
- Cloudflare: DNS/TLS/proxy for shieldme.cc.
- Resend: outbound email and webhook events.
- DigitalOcean: compute hosting.
- Multica: issue orchestration and audit trail for work.
- npm/GitHub ecosystem: dependency/source supply chain.

## Secrets and rotation schedule
- `DATABASE_URL`: rotate annually or after operator change/incident.
- `REDIS_URL`: rotate annually or after incident.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`: rotate at least annually and after suspected compromise; force re-login.
- `RESEND_API_KEY`: rotate semi-annually or after suspected leakage; runtime rotation supported.
- `RESEND_WEBHOOK_SECRET`: rotate semi-annually or after provider changes.
- `ADMIN_SECRET`: deprecated break-glass only; remove after admin account migration confirmed.
