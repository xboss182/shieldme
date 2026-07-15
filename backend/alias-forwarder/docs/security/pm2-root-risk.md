# PM2 Root Process Risk — Accepted Risk Documentation

**Date**: 2026-07-09
**Author**: Full-Stack Developer (MNC-429)
**Finding**: SEC-004 / M3 from Stage 16 security review
**Status**: Remediated / Technical Control Implemented

## Finding

PM2 application processes (`shieldme-site`, `alias-forwarder`, `shieldme-smtp`, `shieldme-worker`) previously ran as `root` on VPS 152.42.211.146.

As of Stage 18, they run under the dedicated `shieldme` service account via `pm2-shieldme.service` and PM2 runtime.

## Risk Description

Running application processes as root means that if any process is compromised via a vulnerability (e.g., RCE in a dependency), the attacker gains root privileges on the host. This is a violation of the principle of least privilege.

**Severity**: Medium
**Exploitability**: Requires an exploitable vulnerability in the application or one of its dependencies.
**Likelihood**: Low (backend audit passes 0 high/critical advisories; frontend passes 0 high advisories post-fix).

## Implemented Control

1. Dedicated service account: `shieldme` (`/var/lib/shieldme`, non-root UID/GID).
2. Backend app path moved out of `/root` to `/opt/shieldme/alias-forwarder` so the service user can execute it without root traversal access.
3. Frontend app path remains `/var/www/shieldme` and is owned by `shieldme:shieldme`.
4. Runtime PM2 home is `/var/lib/shieldme/.pm2`.
5. Systemd unit: `/etc/systemd/system/pm2-shieldme.service` runs `/usr/local/bin/pm2-runtime /opt/shieldme/ecosystem.config.cjs` as `User=shieldme`.
6. Secrets are restricted to service user/root only: `.env` files are mode `0600`.

## Remaining Mitigations

1. **UFW firewall**: Default-deny incoming; only ports 22, 80, 443, 25, 587 allowed externally.
2. **CrowdSec + Fail2ban**: Active on SSH and Caddy auth log jails.
3. **Dependency hygiene**: Backend npm audit = 0 vulnerabilities. Frontend npm audit = 0 high vulnerabilities.
4. **No sensitive mounts**: Application processes do not mount host filesystem paths beyond their own working directories.
5. **Caddy reverse proxy**: All public traffic passes through Caddy; application ports are bound to localhost or behind docker-proxy.
6. **Rate limiting**: Auth endpoints rate-limited to 5 failed attempts per 15 min per IP.

## Rollback

Emergency rollback snapshot: `/root/shieldme-hardening-backups/<timestamp>/`.

1. Stop non-root runtime: `systemctl stop pm2-shieldme.service`.
2. Restore backend if required: `rm -rf /root/alias-forwarder && cp -a /root/shieldme-hardening-backups/<timestamp>/alias-forwarder.root-copy /root/alias-forwarder`.
3. Restore frontend if required: `rm -rf /var/www/shieldme && cp -a /root/shieldme-hardening-backups/<timestamp>/shieldme-site.root-copy /var/www/shieldme`.
4. Restore root PM2 process list if required: `PM2_HOME=/root/.pm2 pm2 resurrect /root/shieldme-hardening-backups/<timestamp>/root-pm2-jlist.json` or manually `pm2 start` the four previous script paths.
5. Verify `/api/health`, `https://app.shieldme.cc`, SMTP listener, worker logs, and Caddy routing.

## Evidence

```
runuser -s /bin/bash shieldme -c 'PM2_HOME=/var/lib/shieldme/.pm2 pm2 list'
# alias-forwarder, shieldme-smtp, shieldme-worker, shieldme-site user: shieldme

ps -o user= -p $(pgrep -f '/opt/shieldme/alias-forwarder/dist/index.js')
# shieldme
```

Accepted by: Manager Agent
Remediated: 2026-07-09
