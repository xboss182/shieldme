# SOC 2 Type I Control Summary — Security, Availability, Confidentiality

**Last Updated**: 2026-07-09
**System**: ShieldMe / alias-forwarder
**Purpose**: Point-in-time Type I readiness summary for external auditor review.

## Scope

This summary maps existing ShieldMe controls and evidence to SOC 2 Trust Services Criteria focus areas requested for the engagement: **Security**, **Availability**, and **Confidentiality**. It is a readiness summary, not an auditor opinion.

## Security

| Control Area | Implemented / Designed Control | Evidence / Source |
|---|---|---|
| Access control | Per-person accounts; admin access via admin-role JWT accounts; strong password policy; account lockout after 5 failed logins for 15 minutes; production shell limited to owner/delegated operators | `/root/alias-forwarder/docs/policies/ACCESS-CONTROL-POLICY.md`; access review evidence under `/root/alias-forwarder/docs/evidence/access-review-*` |
| Authentication/session security | Refresh-token single-use verified; old-token reuse returns `401`; auth rate limit returns `429` after threshold | `/root/alias-forwarder/docs/evidence/stage16-rerun-20260709T213735Z.md` |
| Secrets handling | Required secrets identified; secrets not shared in tickets/chats/logs; `.env` permissions verified as `600`; JWT and Resend rotation process documented | `/root/alias-forwarder/docs/security-operations.md`; `/root/alias-forwarder/docs/evidence/stage16-rerun-20260709T213735Z.md` |
| Network/application hardening | CORS rejects untrusted origins; unsigned Resend webhook returns `401`; malformed JSON returns `400`; oversized payload returns `413`; Cloudflare/Caddy/UFW limit inbound exposure | `/root/alias-forwarder/docs/evidence/stage16-rerun-20260709T213735Z.md`; `/root/alias-forwarder/docs/security/security-review-report.md` |
| Vulnerability management | Backend tests/typecheck passed; backend production audit has 0 high/critical vulnerabilities; frontend production audit has 0 vulnerabilities; ZAP evidence collected | `/root/alias-forwarder/docs/evidence/stage16-rerun-20260709T213735Z.md`; `/root/alias-forwarder/docs/evidence/security-zap-tmp/*` |
| Change management | Changes tracked in Multica/equivalent issue; typecheck/tests/build before deployment; deployment evidence captures PM2 cwd/script, timestamp, restart/save, logs, hashes, verification | `/root/alias-forwarder/docs/policies/CHANGE-MANAGEMENT-POLICY.md`; `/root/alias-forwarder/docs/policies/DEPLOY-CHECKLIST.md`; `/root/alias-forwarder/docs/evidence/change-log-*` |
| Incident response | Severity levels, detect/triage/contain/eradicate/recover/post-mortem process, response targets, and evidence collection defined | `/root/alias-forwarder/docs/policies/INCIDENT-RESPONSE-PLAN.md` |
| Audit/security logging | Structured security events persisted to audit logs with `metadata.securityEvent=true`; admin endpoint for last-24h security events | `/root/alias-forwarder/docs/security-operations.md` |
| Risk management | Risk register tracks threats, likelihood, impact, controls, residual risk, and mitigation plans | `/root/alias-forwarder/docs/policies/risk-register.md` |

### Security Known Exceptions

- PM2 services currently run as root. Compensating controls and remediation plan are documented.
- Redis service configuration remains permissive at bind/protected-mode level, but external access is blocked and localhost proxying is documented. `maxmemory-policy` was remediated to `noeviction`.
- `ADMIN_SECRET` remains deprecated break-glass only pending final removal after admin migration confirmation.

## Availability

| Control Area | Implemented / Designed Control | Evidence / Source |
|---|---|---|
| Service inventory | Critical PM2 services identified: `alias-forwarder`, `shieldme-smtp`, `shieldme-worker`, `shieldme-site`; dependencies: PostgreSQL, Redis, Cloudflare, Resend | `/root/alias-forwarder/docs/policies/asset-inventory.md`; `/root/alias-forwarder/docs/policies/BUSINESS-CONTINUITY-DR-PLAN.md` |
| Health verification | Live health check reports app/Postgres/Redis OK in post-remediation rerun | `/root/alias-forwarder/docs/evidence/stage16-rerun-20260709T213735Z.md` |
| Backup and restore | Daily DB backup script; gzip integrity validation; sha256 generation; 30-day pruning; restore verification script supports isolated test restore | `/root/alias-forwarder/docs/security-operations.md`; `/root/alias-forwarder/scripts/backup-db.sh`; `/root/alias-forwarder/scripts/verify-restore.sh` |
| Disaster recovery | RTO 8 hours for core API/forwarding; RPO 24 hours; recovery outline covers VPS provisioning, DB restore, secrets/config restore, build, restart, health/mail verification | `/root/alias-forwarder/docs/policies/BUSINESS-CONTINUITY-DR-PLAN.md` |
| Redis persistence | Redis persistence check script verifies RDB or AOF deployment persistence; `maxmemory-policy` fixed to `noeviction` | `/root/alias-forwarder/docs/security-operations.md`; `/root/alias-forwarder/scripts/check-redis-persistence.sh`; `/root/alias-forwarder/docs/evidence/stage16-rerun-20260709T213735Z.md` |
| Rollback | Rollback process by reverting code/config, rebuilding, restarting PM2, and verifying health | `/root/alias-forwarder/docs/policies/ROLLBACK-PROCEDURE.md`; `/root/alias-forwarder/docs/policies/CHANGE-MANAGEMENT-POLICY.md` |
| Dependency/vendor continuity | Core vendors identified and reviewed quarterly; Resend outage and VPS outage tracked in risk register with mitigation plans | `/root/alias-forwarder/docs/policies/VENDOR-MANAGEMENT-POLICY.md`; `/root/alias-forwarder/docs/policies/risk-register.md` |

## Confidentiality

| Control Area | Implemented / Designed Control | Evidence / Source |
|---|---|---|
| Data classification/retention | Account data, alias/domain/recipient metadata, mail metadata, audit/security logs, and PGP public keys are categorized; retention periods documented | `/root/alias-forwarder/docs/policies/DATA-RETENTION-POLICY.md` |
| Data minimization | Message bodies are not intentionally persisted; stored mail data is metadata such as envelope sender/recipient, delivery status, size, and external IDs | `/root/alias-forwarder/docs/policies/DATA-RETENTION-POLICY.md` |
| Encryption/transport | Public services use Cloudflare/TLS; webhook signature validation prevents unauthorized provider callback acceptance | `/root/alias-forwarder/docs/policies/asset-inventory.md`; `/root/alias-forwarder/docs/evidence/stage16-rerun-20260709T213735Z.md` |
| PGP handling | PGP public keys/fingerprints tracked; misuse/expiry risk has review mitigation in risk register | `/root/alias-forwarder/docs/policies/DATA-RETENTION-POLICY.md`; `/root/alias-forwarder/docs/policies/risk-register.md` |
| Vendor data sharing | Resend receives forwarded email content for delivery; Cloudflare processes edge HTTP metadata; DigitalOcean hosts runtime data; GitHub/npm receive source/dependency metadata only | `/root/alias-forwarder/docs/policies/VENDOR-MANAGEMENT-POLICY.md` |
| Secret/log confidentiality | Pino redaction and sanitized startup errors reduce secret leakage risk; periodic log sampling listed as mitigation | `/root/alias-forwarder/docs/policies/risk-register.md` |
| Access reviews | Monthly admin/operator access reviews; access removal within 24 hours when no longer needed | `/root/alias-forwarder/docs/policies/ACCESS-CONTROL-POLICY.md`; `/root/alias-forwarder/docs/evidence/access-review-*` |

## Type I Readiness Statement

The controls above are documented and supported by internal evidence for a point-in-time Type I readiness review. Formal auditor testing is still required to confirm control design/implementation and identify gaps before an audit opinion.

## Type II Evidence Gap

For Type II, the owner must operate these controls over a defined evidence period and retain recurring proof, including access reviews, change records, incident logs, backup verification, vendor reviews, vulnerability/audit results, and exception remediation tracking.
