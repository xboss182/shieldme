# Access Control Policy

## Purpose
Define how access to ShieldMe/alias-forwarder systems is granted, reviewed, changed, and revoked.

## Roles
- **User**: owns domains, recipients, aliases, and PGP keys for their account.
- **Admin**: can inspect audit/security events, configure runtime settings, manage abuse controls, and disable users/domains/aliases.
- **Operator**: infrastructure administrator with shell/PM2/Postgres/Redis access on the production VPS.

## Requirements
- One account per person/operator; shared ADMIN_SECRET is deprecated and limited to temporary break-glass use.
- Admin access must use an admin-role JWT account and strong password policy: 12+ chars, mixed case, digit, symbol.
- Failed logins lock the account after 5 failures for 15 minutes.
- Production shell access is limited to the workspace owner and explicitly delegated operators.
- Secrets must not be sent in chat, comments, tickets, or logs.

## Access reviews
- Review admin accounts and VPS operators monthly.
- Remove access within 24 hours when no longer needed.
- Record evidence with `scripts/compliance/access-review.sh`.

## MFA
MFA should be enabled on upstream accounts where available: Cloudflare, DigitalOcean, GitHub, Resend, Multica, and email account recovery.

## ShieldMe service account

ShieldMe PM2 services (`alias-forwarder`, `shieldme-smtp`, `shieldme-worker`, `shieldme-site`) run under the dedicated non-root `shieldme` system user.

**Process manager**: `pm2-shieldme.service` starts `/usr/local/bin/pm2-runtime /opt/shieldme/ecosystem.config.cjs` with `User=shieldme` and `PM2_HOME=/var/lib/shieldme/.pm2`.

**Application paths**:
- Backend/API/SMTP/worker: `/opt/shieldme/alias-forwarder`
- Frontend: `/var/www/shieldme`
- PM2 runtime/logs: `/var/lib/shieldme/.pm2`

**Secret handling**:
- `.env` files are owned by `shieldme:shieldme` and mode `0600`.
- Secrets remain readable by root for break-glass administration and by the service account for runtime only.

**Operator rule**: use `runuser -s /bin/bash shieldme -c 'PM2_HOME=/var/lib/shieldme/.pm2 pm2 <command>'` for service-level PM2 inspection/restarts; avoid starting these four processes in root PM2.
