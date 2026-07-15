# External Auditor Questionnaire Draft — ShieldMe / Alias Forwarder

**Last Updated**: 2026-07-09
**Use**: Draft responses for SOC 2 Type I readiness reviewer, auditor, or penetration-test partner.

## 1. Company / System Description

**System name**: ShieldMe / alias-forwarder

**System purpose**: ShieldMe provides alias email forwarding. Users configure domains, recipients, aliases, and optional PGP public keys. The system receives inbound mail, queues processing, forwards through Resend, and records operational/audit metadata.

**Primary URLs**:

- App: `https://app.shieldme.cc`
- API: `https://api.shieldme.cc`

**Primary hosting environment**:

- VPS: `152.42.211.146` / `mnco-2vcpu-4gb-sgp1`
- Backend path: `/root/alias-forwarder`
- Frontend path: `/var/www/shieldme`
- PM2 services: `alias-forwarder`, `shieldme-smtp`, `shieldme-worker`, `shieldme-site`
- Database: PostgreSQL `alias_forwarder` on port `5433`
- Queue/cache: Redis on port `6379`

## 2. Data Flows

1. User accesses `https://app.shieldme.cc` through Cloudflare/Caddy/TLS.
2. Frontend calls `https://api.shieldme.cc` for authentication and alias/domain/recipient configuration.
3. Backend stores account/configuration/audit data in PostgreSQL.
4. Redis/BullMQ queues email forwarding jobs.
5. Mail services receive/process inbound messages and forward outbound delivery through Resend.
6. Resend webhooks return delivery events to the API; webhook signatures are validated.
7. Audit/security events are logged and persisted for administrative review.

## 3. Data Categories

- Account data: email, password hash, role, status, login/lockout metadata.
- Domain/alias/recipient metadata: routing configuration.
- Mail metadata: envelope sender/recipient, delivery status, size, external IDs.
- Message bodies: not intentionally persisted by ShieldMe; Resend receives forwarded content for delivery.
- Audit/security logs: administrative actions, security events, abuse controls.
- PGP data: public keys and fingerprints only.

Reference: `/root/alias-forwarder/docs/policies/DATA-RETENTION-POLICY.md`

## 4. Vendors / Subservice Organizations

| Vendor | Purpose | Data Shared / Processed |
|---|---|---|
| DigitalOcean | VPS hosting for app, database, Redis, PM2 services | Runtime data hosted on VPS |
| Cloudflare | DNS/CDN/TLS edge for shieldme.cc domains | Edge HTTP metadata |
| Resend | Outbound email delivery and webhook provider | Forwarded email content and delivery events |
| Multica | Issue/task orchestration and work audit trail | Issue/task metadata |
| GitHub/npm | Source/package supply chain | Source/dependency metadata |

Reference: `/root/alias-forwarder/docs/policies/VENDOR-MANAGEMENT-POLICY.md`

## 5. Control Environment Summary

### Security

- Per-person/admin-role JWT accounts; shared `ADMIN_SECRET` deprecated and break-glass only.
- Strong password policy and login lockout.
- Refresh-token single-use verified.
- API/auth rate limits verified.
- CORS rejects untrusted origins.
- Resend/Svix webhook signatures required.
- `.env` permissions verified as `600`.
- Dependency audits and ZAP scan evidence collected.
- Incident response and access control policies documented.

### Availability

- Critical services and dependencies inventoried.
- PM2 restarts/services documented.
- Backup script writes gzip-compressed `pg_dump`, validates gzip integrity, writes sha256, and prunes old backups.
- Restore verification script supports isolated test restore.
- RTO: 8 hours for core API/forwarding.
- RPO: 24 hours, bounded by backup schedule.

### Confidentiality

- Message bodies are not intentionally persisted.
- Audit/security logs retained at least 1 year.
- Mail delivery metadata retained 1 year unless legal/security needs require longer.
- Backups retained 30 days by default.
- Access reviews required monthly.
- Vendor data sharing documented.

## 6. Evidence Available

- Auditor handoff packet: `/root/alias-forwarder/docs/compliance/auditor-handoff-packet.md`
- SOC 2 Type I control summary: `/root/alias-forwarder/docs/compliance/soc2-type-i-control-summary.md`
- Security review report: `/root/alias-forwarder/docs/security/security-review-report.md`
- Post-remediation rerun: `/root/alias-forwarder/docs/evidence/stage16-rerun-20260709T213735Z.md`
- Risk register: `/root/alias-forwarder/docs/policies/risk-register.md`
- Asset inventory: `/root/alias-forwarder/docs/policies/asset-inventory.md`
- Policies: `/root/alias-forwarder/docs/policies/`
- Evidence files: `/root/alias-forwarder/docs/evidence/`
- Security operations: `/root/alias-forwarder/docs/security-operations.md`

## 7. Known Exceptions / Open Risks

1. **PM2 runs as root**
   - Treatment: Accepted for current Type I readiness stage with compensating controls.
   - Compensating controls: single-tenant VPS, restricted operator shell access, Caddy/UFW inbound restrictions.
   - Planned remediation: create dedicated `shieldme` service user and run PM2 services under it.

2. **Redis bind/protected-mode posture**
   - Treatment: Accepted with network compensating controls.
   - Current controls: external port blocked; Docker proxy limited to localhost; `maxmemory-policy` fixed to `noeviction`.

3. **Deprecated `ADMIN_SECRET` break-glass path**
   - Treatment: Temporary transitional control.
   - Plan: remove after admin account migration is confirmed.

## 8. Requested Auditor / Partner Review

- Confirm SOC 2 Type I scope boundaries.
- Validate whether known exceptions should be remediated before formal Type I testing.
- Identify gaps in policies/evidence before Type I audit.
- Recommend evidence cadence and control owner structure for a future Type II period.
- Conduct external penetration test against app/API scope if included in engagement.

## 9. Human Owner Decisions Still Required

- Choose auditor/compliance partner or compliance automation platform.
- Decide whether external pen test occurs before readiness review, in parallel, or after readiness gap assessment.
- Confirm Type I point-in-time audit date/window.
- Decide whether Type II is a target and, if so, define evidence period length.
- Confirm named human owners for access review, vendor review, backup verification, incident response, and change management controls.
- Decide whether to remediate PM2 root and Redis bind posture before sending to auditor or list them as accepted exceptions.
