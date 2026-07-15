# Incident Response Plan

## Severity levels
- **SEV1**: confirmed data exposure, active compromise, mail forwarding outage affecting all users.
- **SEV2**: suspected compromise, degraded forwarding, high-volume abuse, key leakage.
- **SEV3**: isolated user issue, failed deploy, non-critical alert.

## Process
1. **Detect**: security events, PM2 logs, user reports, Cloudflare/Resend abuse notifications.
2. **Triage**: assign severity, capture timeline, preserve logs.
3. **Contain**: disable compromised accounts/aliases/domains, rotate keys, enable forwarding kill-switch if needed.
4. **Eradicate**: patch vulnerable code/config, remove attacker access, update rules.
5. **Recover**: redeploy, restore data if needed, verify API/SMTP/worker health.
6. **Post-mortem**: document root cause, impact, controls that failed, and preventive actions.

## Response targets
- SEV1 acknowledgement: 30 minutes; containment target: 4 hours.
- SEV2 acknowledgement: 4 hours; containment target: 1 business day.
- SEV3 acknowledgement: 1 business day.

## Evidence
Collect `pm2 logs`, security events, audit logs, deploy history, and output from `scripts/compliance/evidence-collector.sh`.
