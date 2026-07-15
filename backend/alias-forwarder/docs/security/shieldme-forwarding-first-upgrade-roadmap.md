# ShieldMe Forwarding-First Security Upgrade Roadmap

**Date**: 2026-07-11
**Issue**: MNC-449
**Maintainer**: Documentation Writer
**Scope**: Security upgrades that preserve ShieldMe as a forwarding-first privacy product.

## Executive Summary

ShieldMe should improve the security of its existing alias-forwarding model rather than expanding into mailbox hosting. The highest-value upgrades are transient message protection in Redis/BullMQ, clearer PGP forwarding policy and UX, delivery/authentication hardening, delivery failure handling without body storage, tracking protection, infrastructure hardening, queue-and-forward backup MX, and safe public claims.

This roadmap assumes ShieldMe continues to:

- Receive mail for aliases and forward it to verified recipients.
- Store only metadata in PostgreSQL.
- Avoid persistent message body storage.
- Use optional or required OpenPGP forwarding where recipients provide public keys.
- Avoid mailbox protocols and hosted mailbox product features.

## Guardrails

- No message body persistence in PostgreSQL.
- Redis/BullMQ payloads must be transient and encrypted before queue storage.
- PGP private keys remain outside ShieldMe.
- Backup MX, if added, is queue-and-forward only.
- Resend/SES fallback must not downgrade PGP-required deliveries to plaintext.
- Public language must distinguish PGP-encrypted forwarding from encrypted mailbox hosting.

## Phase Table

| Phase | Upgrade | Priority | Effort | Risk Reduced | Dependencies | Owner Type |
|---|---|---:|---:|---|---|---|
| 1 | Redis/BullMQ payload encryption and TTL cleanup | P0 | Medium | Plaintext exposure in Redis memory, persistence, and crash residue | Queue schema review, key management plan | Full-Stack / QA |
| 2 | PGP forwarding UX and policy hardening | P0 | Medium | Accidental plaintext forwarding, key-expiry failures, unclear required mode | Existing `pgp_keys` and alias PGP mode data | Full-Stack / Documentation / QA |
| 3 | Outbound delivery/authentication hardening | P1 | Medium-High | SPF/DMARC failures, ESP dependency, plaintext fallback mistakes | DNS workflows, provider config, DKIM/SRS design | Full-Stack / DevOps / QA |
| 4 | Delivery failure handling without body storage | P1 | Medium | Mail loops, repeated bad delivery attempts, invisible failures | Resend/SES webhook access, normalized event schema | Full-Stack / QA |
| 5 | Tracking protection | P1 | Medium | Recipient tracking pixels and noisy tracking links | Parser/sanitizer selection, metadata-only event model | Full-Stack / QA |
| 6 | Infrastructure hardening baseline | P1 | Medium | Host compromise, config drift, weak service isolation | MNC-448 Ansible baseline | DevOps / QA |
| 7 | Backup MX resilience without mailbox product | P2 | High | Primary MX/node outage mail loss | Secondary VPS, encrypted queue, relay auth, DNS MX plan | DevOps / Full-Stack / QA |
| 8 | Public claims and documentation cleanup | P0 | Low | Marketing/legal overclaim risk | Current trust/security pages | Documentation / QA |

## 30/60/90-Day Execution Roadmap

### First 30 Days — P0 Privacy and Claims

1. **Encrypt Redis/BullMQ payloads before queue storage**
   - Add a queue payload encryption/decryption wrapper around job enqueue/process.
   - Use authenticated encryption such as AES-256-GCM or ChaCha20-Poly1305.
   - Store encryption keys outside Redis and outside job payloads.
   - Include key version metadata in jobs for rotation.
   - Confirm `mail_logs` remains metadata-only.

2. **Add queue TTL and cleanup guarantees**
   - Define max age for active, delayed, failed, and dead-lettered mail jobs.
   - Ensure terminal jobs remove message bodies or encrypted payloads.
   - Add an operator-visible cleanup check for stale mail jobs.
   - Verify Redis persistence does not retain plaintext payloads.

3. **Clarify PGP forwarding modes**
   - Show clear behavior for `none`, `optional`, and `required` modes.
   - In required mode, never forward plaintext if no valid recipient key exists or encryption fails.
   - Add failure copy that explains the recipient must update the public key.

4. **Clean up public claims**
   - Use “forwarding-first privacy model,” “optional OpenPGP encrypted forwarding,” “metadata-only database,” and “self-hosted trust boundary.”
   - Avoid “quantum-safe email provider,” “zero-knowledge mailbox,” “encrypted mailbox hosting,” and mailbox replacement claims.

### Days 31–60 — Delivery and UX Hardening

1. **PGP lifecycle UX**
   - Validate public keys on upload.
   - Warn about expired or soon-expiring keys.
   - Add a test encrypted delivery action.
   - Add key rotation guidance and dashboard indicators showing protected/unprotected aliases and recipients.

2. **Outbound delivery authentication**
   - Evaluate local DKIM signing per ShieldMe-controlled or custom domain where appropriate.
   - Design SRS envelope rewriting for forwarded mail if needed to improve SPF/DMARC compatibility.
   - Define Resend/SES fallback policy that preserves PGP-required encryption and does not leak plaintext.
   - Start DMARC alignment monitoring before changing enforcement.

3. **Delivery failure handling**
   - Normalize Resend and SES webhook events into a shared internal event model.
   - Suppress repeated hard bounces and complaints.
   - Expose user/admin delivery failure status without storing bodies.
   - Define retry and dead-letter behavior with encrypted/no-body payload guarantees.

4. **Tracking protection**
   - Strip or neutralize common tracking pixels in forwarded HTML.
   - Optionally clean common tracking query parameters from links.
   - Store only safe metadata such as count, action, and reason; never store message bodies.

### Days 61–90 — Infrastructure and Resilience

1. **Apply Ansible hardening baseline from MNC-448**
   - UFW minimum ports.
   - fail2ban for SSH and SMTP abuse.
   - SSH key-only access and root-login restrictions.
   - Caddy TLS and security headers.
   - Service isolation under non-root `shieldme` user.
   - PM2/systemd restart safeguards and health checks.

2. **Backup MX / queue-and-forward resilience**
   - Design secondary MX as store-and-forward only, not a mailbox host.
   - Encrypt queued payloads on the secondary node before storage.
   - Define queue TTL and terminal discard policy.
   - Relay to primary or outbound provider only after policy validation.
   - Document MX priority, failure modes, and operational runbook.

3. **Validation and external readiness**
   - Run QA acceptance tests for PGP-required no-plaintext behavior.
   - Verify no message bodies are written to PostgreSQL.
   - Verify Redis queue payloads are encrypted at rest/in persistence.
   - Review public copy against safe/unsafe claim checklist.

## Acceptance Gates by Phase

### Phase 1 — Transient Message Protection

- BullMQ jobs no longer contain plaintext `subject`, `textBody`, `htmlBody`, attachments, or raw message fields in Redis.
- Worker decrypts only in memory immediately before delivery or PGP encryption.
- Failed/dead-lettered jobs retain no plaintext body material.
- Queue cleanup job removes expired encrypted payloads according to documented TTL.
- Tests prove PostgreSQL does not store message bodies.

### Phase 2 — PGP Forwarding UX and Policy

- UI and docs explain `none`, `optional`, and `required` modes.
- Required mode blocks plaintext forwarding when a valid public key is unavailable.
- Key upload validates parseability, user identity metadata where available, and expiration.
- Dashboard shows protected/unprotected status per alias/recipient.
- Test encrypted delivery confirms recipient can decrypt before required mode is enforced.

### Phase 3 — Outbound Delivery and Authentication

- DKIM/SRS decision is documented with implementation steps and rollback.
- Provider fallback cannot bypass PGP-required encryption.
- DMARC aggregate monitoring is active before enforcement changes.
- Forwarded messages pass expected authentication checks in representative recipient systems.

### Phase 4 — Delivery Failure Handling

- Resend and SES webhook events normalize into the same delivery status vocabulary.
- Hard bounces and complaints suppress future delivery attempts.
- Users/admins can see delivery failures without body storage.
- Retry/dead-letter policy is documented and tested with encrypted/no-body queues.

### Phase 5 — Tracking Protection

- Tracking pixels are stripped or neutralized in HTML forwarding tests.
- Optional query cleanup is deterministic and does not break safe links in test cases.
- Stored tracking metadata contains only count/action/reason and no body content.

### Phase 6 — Infrastructure Hardening

- Ansible baseline applies cleanly to a fresh host or staging host.
- UFW, fail2ban, SSH hardening, Caddy headers, service user ownership, and PM2/systemd restart safeguards are verified.
- No secrets are printed in logs or documentation.

### Phase 7 — Backup MX / Resilience

- Secondary MX accepts mail only for valid ShieldMe domains/aliases.
- Secondary MX stores encrypted transient payloads only, with TTL cleanup.
- Secondary MX does not expose IMAP/POP3/JMAP, webmail, or user mailboxes.
- Failover and replay tests prove queue-and-forward behavior.

### Phase 8 — Public Claims / Marketing Safety

- Trust/security pages use only safe claims.
- Unsafe mailbox-hosting and quantum-safe-provider claims are absent.
- Docs clearly state ShieldMe is not a hosted encrypted mailbox provider.

## Out of Scope

The following are explicitly outside this roadmap because they would change ShieldMe from a forwarding-first product into a mailbox provider:

- Hosted user inboxes or mailbox storage.
- Encrypted mailbox-at-rest architecture.
- Zero-knowledge mailbox storage.
- IMAP, POP3, or JMAP mailbox access.
- Webmail, folders, drafts, searchable mailbox indexes, or long-term message retention.
- Per-mailbox password-derived encryption keys.
- Proton/ForwardEmail-style mailbox replacement product work.
- Public claims that ShieldMe is a quantum-safe email provider or zero-knowledge mailbox service.

## Safe Public Claims

Use the reusable [Safe Public Claims Checklist](./safe-public-claims-checklist.md) for all trust, security, privacy, roadmap, and marketing copy.

ShieldMe can safely claim:

- Forwarding-first privacy model.
- Optional OpenPGP encrypted forwarding.
- Required PGP mode for aliases that must not forward plaintext without a valid key.
- Metadata-only database for mail logs.
- No message body persistence in PostgreSQL.
- Self-hosted trust boundary.
- Recipient-controlled decryption when OpenPGP forwarding is enabled.

ShieldMe should avoid claiming, except when explicitly framed as outside current ShieldMe scope:

- Quantum-safe email provider.
- Zero-knowledge mailbox.
- Encrypted mailbox hosting.
- Hosted encrypted inbox.
- Full Proton/ForwardEmail mailbox replacement.
- No plaintext ever touches ShieldMe.
- Post-quantum secure email service.

## Related Documents

- [Safe Public Claims Checklist](./safe-public-claims-checklist.md)
- [ShieldMe Security Infrastructure](./shieldme-security-infrastructure.md)
- [ShieldMe Quantum-Safe / Encrypted Email Gap Analysis](./shieldme-quantum-safe-encryption-gap-analysis.md)
