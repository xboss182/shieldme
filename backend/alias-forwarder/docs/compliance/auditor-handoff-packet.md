# ShieldMe / Alias Forwarder — SOC 2 Type I Auditor Handoff Packet

**Last Updated**: 2026-07-09
**Prepared For**: External SOC 2 Type I readiness / penetration-test engagement
**System**: ShieldMe alias email forwarder (`alias-forwarder`)
**Readiness Verdict**: Internal review says **ship-ready for external penetration test / SOC 2 Type I readiness review**.

## Owner-Facing Summary

ShieldMe is ready to hand off to an external auditor or compliance partner for a SOC 2 Type I readiness review and penetration test. Internal hardening, policy/evidence preparation, security review, and high/medium remediation stages are complete. The remaining known exceptions are documented and currently accepted for the Type I readiness stage: PM2 services run as root with compensating controls, and Redis remains permissively bound at service config level while externally firewalled and Docker-proxied to localhost.

This packet provides the auditor with the system scope, evidence locations, policies, risk register, asset inventory, operational procedures, control summary, questionnaire draft, known exceptions, and owner decisions needed before engagement kickoff.

## Engagement Scope

### In Scope

- Backend application: `/root/alias-forwarder`
- Frontend application: `/var/www/shieldme`
- Public API: `https://api.shieldme.cc`
- Public app: `https://app.shieldme.cc`
- Production host: `152.42.211.146` / `mnco-2vcpu-4gb-sgp1`
- PM2 services: `alias-forwarder`, `shieldme-smtp`, `shieldme-worker`, `shieldme-site`
- PostgreSQL database: `alias_forwarder` on port `5433`
- Redis queue/cache: port `6379`
- Third-party dependencies: DigitalOcean, Cloudflare, Resend, Multica, GitHub/npm

### Out of Scope Unless Auditor Requests Expansion

- Non-ShieldMe services on the same VPS
- Owner personal accounts outside access/control evidence
- Type II operating effectiveness testing period, except where evidence-readiness is discussed

## Key Evidence and Artifact Index

### Security Review / Penetration-Test Readiness

- Internal security review report: `/root/alias-forwarder/docs/security/security-review-report.md`
- Post-remediation rerun evidence: `/root/alias-forwarder/docs/evidence/stage16-rerun-20260709T213735Z.md`
- Initial Stage 16 security review evidence: `/root/alias-forwarder/docs/evidence/stage16-security-review-20260709T204801Z.md`
- ZAP scan outputs:
  - `/root/alias-forwarder/docs/evidence/security-zap-tmp/app-zap.html`
  - `/root/alias-forwarder/docs/evidence/security-zap-tmp/app-zap.json`
  - `/root/alias-forwarder/docs/evidence/security-zap-tmp/api-zap.html`
  - `/root/alias-forwarder/docs/evidence/security-zap-tmp/api-zap.json`
  - `/root/alias-forwarder/docs/evidence/security-zap-tmp/zap.yaml`
- PM2 root risk note: `/root/alias-forwarder/docs/security/pm2-root-risk.md`

### Policies

- Access control: `/root/alias-forwarder/docs/policies/ACCESS-CONTROL-POLICY.md`
- Acceptable use: `/root/alias-forwarder/docs/policies/ACCEPTABLE-USE-POLICY.md`
- Change management: `/root/alias-forwarder/docs/policies/CHANGE-MANAGEMENT-POLICY.md`
- Deploy checklist: `/root/alias-forwarder/docs/policies/DEPLOY-CHECKLIST.md`
- Rollback procedure: `/root/alias-forwarder/docs/policies/ROLLBACK-PROCEDURE.md`
- Incident response: `/root/alias-forwarder/docs/policies/INCIDENT-RESPONSE-PLAN.md`
- Business continuity / disaster recovery: `/root/alias-forwarder/docs/policies/BUSINESS-CONTINUITY-DR-PLAN.md`
- Data retention: `/root/alias-forwarder/docs/policies/DATA-RETENTION-POLICY.md`
- Vendor management: `/root/alias-forwarder/docs/policies/VENDOR-MANAGEMENT-POLICY.md`

### Registers / Inventories

- Risk register: `/root/alias-forwarder/docs/policies/risk-register.md`
- Asset inventory: `/root/alias-forwarder/docs/policies/asset-inventory.md`

### Compliance Evidence

- Security posture evidence: `/root/alias-forwarder/docs/evidence/security-posture-*`
- Access review evidence: `/root/alias-forwarder/docs/evidence/access-review-*`
- Change/deploy evidence: `/root/alias-forwarder/docs/evidence/change-log-*`

### Operational Procedures

- Security operations: `/root/alias-forwarder/docs/security-operations.md`
- Backup script: `/root/alias-forwarder/scripts/backup-db.sh`
- Restore verification script: `/root/alias-forwarder/scripts/verify-restore.sh`
- Redis persistence check: `/root/alias-forwarder/scripts/check-redis-persistence.sh`
- Compliance evidence collector: `/root/alias-forwarder/scripts/compliance/evidence-collector.sh`
- Access review evidence script: `/root/alias-forwarder/scripts/compliance/access-review.sh`

## Control Summary

See `/root/alias-forwarder/docs/compliance/soc2-type-i-control-summary.md` for the Trust Services Criteria mapping across Security, Availability, and Confidentiality.

## External Auditor Questionnaire Draft

See `/root/alias-forwarder/docs/compliance/external-auditor-questionnaire.md` for a draft questionnaire response covering company/system description, data flows, vendors, controls, evidence, exceptions, and decisions.

## Current Known Exceptions

| Exception | Status | Current Treatment | Evidence |
|---|---|---|---|
| PM2 services run as root | Accepted for current audit-readiness stage | Single-tenant VPS, restricted operator access, Caddy/UFW limits inbound surface; dedicated `shieldme` user planned as future hardening | `/root/alias-forwarder/docs/policies/ACCESS-CONTROL-POLICY.md`, `/root/alias-forwarder/docs/security/pm2-root-risk.md` |
| Redis service config has permissive bind/protected-mode posture | Accepted with compensating network controls | Port `6379` confirmed blocked externally; Docker proxy limited to `127.0.0.1:6379`; maxmemory policy fixed to `noeviction` | `/root/alias-forwarder/docs/evidence/stage16-rerun-20260709T213735Z.md` |
| `ADMIN_SECRET` still exists as deprecated break-glass path | Transitional risk | Normal admin access uses per-operator admin JWT accounts; remove after migration confirmed | `/root/alias-forwarder/docs/policies/ACCESS-CONTROL-POLICY.md`, `/root/alias-forwarder/docs/policies/asset-inventory.md` |

## Type I vs Type II Boundary

- **SOC 2 Type I readiness / Type I audit**: evaluates whether controls are suitably designed and implemented at a point in time. This packet supports that point-in-time review.
- **SOC 2 Type II**: evaluates operating effectiveness over an evidence period, commonly 3–12 months. The current artifacts can seed Type II evidence collection, but they do **not** by themselves prove Type II operating effectiveness.
- Recommended next step after Type I readiness: define the Type II evidence window, recurring evidence cadence, control owners, and evidence repository/process.

## Human Owner Decisions Before Kickoff

Detailed checklist: `/root/alias-forwarder/docs/compliance/owner-decision-checklist.md`

1. Choose an auditor/compliance partner or compliance automation tool.
2. Confirm the audit scope: ShieldMe only vs. broader VPS/workspace services.
3. Confirm engagement type: external penetration test, SOC 2 Type I readiness assessment, formal Type I audit, or staged sequence.
4. Define the review date/window for Type I point-in-time testing.
5. Decide whether to remediate PM2 root execution before external testing or document it as a known exception.
6. Decide whether to remediate Redis bind/protected-mode posture before external testing or document compensating controls.
7. Define Type II target period if the intent is to proceed beyond Type I.
8. Identify the human control owner for recurring access reviews, vendor reviews, backup verification, and change evidence.

## Suggested Auditor Kickoff Message

> We are preparing ShieldMe, an alias email forwarding service, for SOC 2 Type I readiness and external penetration testing. Internal hardening, policy preparation, evidence collection, security review, and remediation are complete. Current internal verdict is ship-ready for external pen test / Type I readiness review. The attached packet includes system scope, asset inventory, risk register, policies, evidence paths, control summary, questionnaire draft, and known exceptions. We would like help confirming audit scope, readiness gaps, and the path to Type I followed by a future Type II evidence period.
