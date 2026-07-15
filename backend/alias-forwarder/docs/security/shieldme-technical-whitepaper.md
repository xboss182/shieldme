# ShieldMe Technical Whitepaper

**Version**: 1.0
**Date**: 2026-07-11
**Scope**: Forwarding-first privacy architecture for ShieldMe custom-domain alias forwarding

---

## 1. Abstract

ShieldMe is a forwarding-first privacy service for custom-domain email aliases. Its core thesis is that users can reduce identity exposure and centralize alias control without requiring ShieldMe to become their mailbox host.

ShieldMe’s current trust boundary is intentionally narrow:

- ShieldMe receives mail for verified aliases.
- It validates the recipient, applies abuse and safety checks, and forwards to the user’s chosen inbox.
- PostgreSQL stores forwarding metadata only, not message bodies, HTML bodies, attachments, or mailbox content.
- Redis/BullMQ is used for transient queue processing.
- Optional or required OpenPGP forwarding can encrypt the forwarded body before handoff to Resend or Amazon SES.
- Recipient private keys remain outside ShieldMe.

This whitepaper describes ShieldMe’s system architecture, threat model, cryptographic forwarding model, deliverability posture, abuse controls, operational security, and forwarding-first roadmap. It deliberately avoids mailbox-hosting claims: ShieldMe is not an IMAP/POP3/JMAP provider, not a hosted encrypted inbox, not a zero-knowledge mailbox, and not a Proton- or ForwardEmail-style mailbox replacement.

---

## 2. Problem Statement

Email aliases reduce identity exposure by letting users publish purpose-specific addresses instead of a permanent personal address. However, alias forwarding systems still sit in the message path. Inbound SMTP mail is usually plaintext from the sender’s perspective, and a forwarding gateway must receive, parse, validate, scan, and route that message before it reaches the destination inbox.

Users need a privacy-forward alias system that minimizes what the forwarding provider retains, while preserving their ability to use an existing mailbox provider. ShieldMe addresses this by staying forwarding-first:

- It does not create user mailboxes.
- It does not store permanent message bodies.
- It does not ask users to migrate away from their current inbox.
- It can encrypt the forwarded copy with the recipient’s OpenPGP public key when configured.

The result is a narrower and more honest privacy model than a mailbox provider claim: ShieldMe reduces retained data and limits provider exposure, but it does not eliminate all transient plaintext handling inherent to normal SMTP forwarding.

---

## 3. System Architecture

### 3.1 Core Objects

ShieldMe’s forwarding model is organized around domains, recipients, aliases, optional PGP public keys, and bodyless mail logs.

- **Domains**: custom domains owned and verified by ShieldMe users.
- **Recipients**: verified destination inbox addresses controlled by the user.
- **Aliases**: local parts on verified domains that route inbound mail to a verified recipient.
- **PGP keys**: optional recipient public keys used for encrypted forwarding.
- **Mail logs**: bodyless delivery metadata for auditability, troubleshooting, and abuse response.

The implementation uses PostgreSQL tables for these control-plane objects, including `domains`, `recipients`, `aliases`, `pgp_keys`, `mail_logs`, `sender_blocklists`, `suppression_list`, and `audit_logs`.

### 3.2 Forwarding Flow

```text
Sender SMTP
   |
   v
ShieldMe SMTP ingress
   |
   |-- Parse envelope/message metadata
   |-- Validate alias/domain/recipient state
   |-- Apply abuse, spam, rate, and policy checks
   v
Redis/BullMQ forwarding queue
   |
   v
ShieldMe worker
   |
   |-- Re-check account, plan, alias, recipient, and kill-switch state
   |-- Apply tracking protection and forwarding banner
   |-- Encrypt body with recipient OpenPGP key when configured
   v
Outbound provider abstraction
   |
   |-- Resend primary or Amazon SES fallback
   v
Recipient inbox
```

SMTP ingress is implemented by a custom Node.js service using `smtp-server` and `mailparser`. It accepts the message, extracts routing data and safe metadata, and calls the inbound handling path. Forwarding work is then processed asynchronously by BullMQ workers using Redis.

### 3.3 API, Dashboard, and Admin Controls

ShieldMe exposes a REST API and dashboard for domain onboarding, recipient verification, alias management, PGP public-key management, plan enforcement, admin security events, a global forwarding kill-switch, and provider webhook processing.

### 3.4 Persistence Model

PostgreSQL is used for metadata and control-plane state. The `mail_logs` table is explicitly metadata-only. It stores envelope sender/recipient, alias ID, destination recipient address, provider message IDs, delivery status, failure reason, authentication metadata, spam metadata, tracking-protection metadata, PGP mode/encryption status, timestamps, and size metadata.

It does **not** store message bodies, HTML bodies, attachments, or hosted mailbox content.

Redis/BullMQ currently carries transient forwarding jobs. Current job payloads can include subject, text body, and HTML body for forwarding work. This is not permanent mailbox storage, but it is a meaningful transient privacy surface and is called out in the roadmap for payload encryption.

---

## 4. Threat Model

### 4.1 Baseline Email Reality

Most email begins as normal SMTP content. Unless the sender uses end-to-end encryption before sending, the message can be plaintext at multiple points: sender infrastructure, transit MTAs, ShieldMe ingress, outbound ESPs, and the final recipient inbox.

ShieldMe reduces selected risks; it does not claim to remove every plaintext exposure in the global email system.

### 4.2 Threats ShieldMe Reduces

- **Long-term body retention risk**: ShieldMe does not persist message bodies in PostgreSQL or create hosted mailboxes.
- **Alias identity exposure**: users can publish aliases instead of a permanent personal address.
- **Outbound ESP content visibility when PGP is enabled**: Resend/SES receive ciphertext for the forwarded body after successful OpenPGP encryption.
- **Abuse and relay risk**: alias validation, blocklists, suppression, rate limits, spam scanning, and plan limits reduce misuse.
- **Operational blast radius**: Caddy, PM2, a non-root `shieldme` service user, UFW/fail2ban posture, and metadata-only logging reduce common host and application risks.

### 4.3 Threats That Remain

- **Sender-side plaintext**: ShieldMe cannot control whether the original sender encrypts before SMTP submission.
- **Transient gateway plaintext**: ShieldMe must parse and process messages before optional PGP forwarding encryption.
- **Redis/BullMQ queue exposure**: current queue jobs may contain plaintext body fields until encrypted queue payloads are implemented.
- **Outbound ESP visibility for non-PGP aliases**: Resend/SES see plaintext forwarded content when PGP is disabled or optional mode falls back to plaintext.
- **Recipient inbox compromise**: once delivered, mailbox security depends on the user’s recipient provider and local device hygiene.
- **DNS and mail-auth risks**: SPF, DKIM, DMARC, MTA-STS, TLS-RPT, DNSSEC, local DKIM, and SRS require ongoing configuration and monitoring.
- **Single-node resilience limits**: current deployment is centered on one ShieldMe VPS; outage resilience requires future queue-and-forward backup MX design.

### 4.4 Server Compromise

A host-level compromise is a high-impact event because the forwarding gateway processes transient plaintext. The current model minimizes permanent body storage but cannot claim that plaintext never touches ShieldMe. Queue payload encryption, stronger isolation, monitoring, and hardened deployment automation are the key next reductions.

---

## 5. Privacy and Data Minimization Model

ShieldMe’s privacy model is based on not becoming the mailbox:

- **No mailbox hosting**: ShieldMe does not provide an inbox, folders, drafts, webmail, IMAP, POP3, or JMAP.
- **No permanent message body storage**: message body content is not written to PostgreSQL mail logs.
- **Metadata-only logs**: retained records focus on delivery, abuse, authentication, provider, spam, and PGP status metadata.
- **User-controlled destination inbox**: the user keeps their real mailbox with their chosen provider.
- **Recipient-controlled decryption**: when PGP forwarding is enabled, ShieldMe stores recipient public keys only; private keys remain with the recipient.

This model is intentionally different from encrypted mailbox hosting. ShieldMe does not derive mailbox keys, store encrypted mailbox databases, offer encrypted search indexes, or recover private key material.

---

## 6. Cryptographic Model for Forwarding

### 6.1 OpenPGP Forwarding

ShieldMe supports OpenPGP public-key encryption for forwarded mail. Users can upload a recipient public key, and aliases can use PGP modes:

- **`none`**: forward without PGP encryption.
- **`optional`**: encrypt when a valid recipient public key is available; otherwise forward plaintext.
- **`required`**: reject delivery when a valid key is missing or encryption fails.

The PGP implementation validates uploaded public keys, rejects private-key uploads, records fingerprint/algorithm/expiration metadata, and uses `openpgp` to encrypt the composed forwarded message body.

### 6.2 Key Ownership

ShieldMe stores recipient public keys in `pgp_keys.public_key_armored`. It does not store recipient private keys. This is the correct forwarding trust boundary: ShieldMe can encrypt to the recipient, but only the recipient can decrypt with private key material held outside ShieldMe.

### 6.3 Provider Visibility

When PGP encryption succeeds:

- The forwarded message body handed to Resend or SES is armored OpenPGP ciphertext.
- The recipient mailbox receives ciphertext.
- Local decryption depends on the recipient’s private key and client workflow.

When PGP is disabled, unavailable in optional mode, or not applicable, the outbound provider and recipient mailbox provider see normal forwarded content.

### 6.4 Transient Plaintext and Queue Encryption Gap

OpenPGP forwarding is performed by the worker before outbound handoff. Plaintext can exist earlier in the path during SMTP ingress, parsing, queueing, and worker processing. Current BullMQ job payloads can include subject, plain-text body, and HTML body.

Recommended upgrade: encrypt Redis/BullMQ payloads before queue storage using authenticated encryption such as AES-256-GCM or ChaCha20-Poly1305, with key material stored outside Redis and versioned for rotation. This would reduce exposure from Redis memory, persistence files, crash residue, and stale jobs while preserving the forwarding-first model.

---

## 7. Deliverability and Authentication

ShieldMe depends on both DNS-level email authentication and outbound provider behavior.

### 7.1 Current Posture

- **SPF**: configured for ShieldMe/provider mail flows.
- **DKIM**: currently provider-owned for outbound delivery through Resend/SES; local ShieldMe signing is a roadmap item.
- **DMARC**: monitoring-first posture; progression to quarantine/reject should be staged only after aggregate report review.
- **MTA-STS and TLS-RPT**: available for transport-policy visibility and reporting.
- **CAA**: restricts authorized certificate authorities and provides incident contact posture.
- **DNSSEC**: live for DNS integrity posture.
- **DANE/TLSA**: deferred until certificate ownership and renewal automation are safe.

### 7.2 Provider Abstraction

Outbound delivery is abstracted between Resend and Amazon SES. This reduces single-provider coupling but does not remove ESP trust. The fallback path must preserve PGP-required semantics and must never downgrade a required encrypted delivery to plaintext.

### 7.3 Forwarding-Specific Upgrades

Forwarding introduces authentication challenges because forwarded messages often fail SPF at the final destination when the original envelope sender is preserved. ShieldMe’s roadmap should prioritize SRS, local DKIM signing, DMARC alignment monitoring, and webhook normalization for Resend/SES bounces, complaints, delivery failures, and suppressions.

---

## 8. Abuse, Spam, and Tracking Protection

### 8.1 Abuse Controls

ShieldMe includes layered controls to reduce abuse and protect sender reputation:

- Domain, alias, recipient, and user state checks.
- Per-alias and global sender blocklists.
- Suppression list for bounces, complaints, and manual suppression.
- Login/API rate limiting.
- Account plan limits and monthly forwarding limits.
- Global forwarding kill-switch for emergency operator intervention.
- Duplicate/loop and auto-reply defenses where implemented in the forwarding path.

### 8.2 Spam Scanning

ShieldMe integrates Spam Scanner metadata into forwarding decisions and headers. Spam scanning can tag messages, store safe scan metadata, and support rejection or operator policy decisions without storing body content permanently in PostgreSQL.

### 8.3 Tracking Protection

ShieldMe includes a tracking-protection pipeline for forwarded HTML. It can remove likely tracking pixels and strip common tracking query parameters from links, depending on configured mode. Stored tracking-protection data is metadata such as counts and actions, not message bodies.

Roadmap work should continue toward deterministic tests, safe-link preservation, user-visible policy controls, and strict no-body persistence.

---

## 9. Operational Security

### 9.1 Runtime and Network

ShieldMe runs on a self-hosted VPS trust boundary with Caddy as reverse proxy and PM2-managed Node.js services. Public-facing components include the dashboard/frontend, REST API, and SMTP ingress. Redis and PostgreSQL are intended to be local-only service dependencies.

Key operational controls:

- Caddy TLS termination and security headers.
- PM2/systemd process supervision.
- Non-root `shieldme` service user for application processes.
- UFW allowlist for required ports.
- fail2ban and SSH hardening baseline.
- Environment-file permissions restricted to the service user.
- Security events and admin visibility for sensitive actions.
- Encrypted offsite backups for database recovery.

### 9.2 Administrative Controls

Operational controls include a global forwarding kill-switch, audit logs, admin security event visibility, and provider configuration management. Admin surfaces should continue moving away from legacy break-glass secrets toward auditable account-based administration with MFA/session hardening.

### 9.3 Compliance Posture

ShieldMe has internal SOC 2 Type I readiness documentation and policy artifacts. This is not the same as external certification. Public claims should distinguish internal readiness from a completed third-party audit.

---

## 10. Forwarding-First Upgrade Roadmap

The following upgrades preserve ShieldMe as a forwarding-first privacy product.

### 10.1 Redis/BullMQ Payload Encryption

Encrypt message content fields before queue insertion and decrypt only inside the worker. Include authenticated encryption, key versions for rotation, no key material in Redis or job payloads, tests proving Redis jobs contain no plaintext body/subject/attachment/raw message fields, and cleanup for active, failed, delayed, and dead-lettered jobs.

### 10.2 Queue-and-Forward Backup MX

Add backup MX only as encrypted short-TTL queue-and-forward infrastructure. It must not expose webmail, mailboxes, IMAP, POP3, or JMAP. It should accept only valid ShieldMe domains and aliases, store transient payloads encrypted, replay after validation, and delete after TTL or terminal delivery state.

### 10.3 PGP UX Improvements

Improve public-key validation, expiration warnings, test encrypted delivery, key rotation guidance, clear `none`/`optional`/`required` mode explanations, protected/unprotected alias indicators, and required-mode failures that never silently downgrade to plaintext.

### 10.4 Local DKIM, SRS, and DMARC Progression

Evaluate local DKIM signing for ShieldMe-controlled forwarding, add SRS or equivalent envelope rewriting where appropriate, monitor DMARC aggregate reports before enforcement changes, and publish a protocol/support matrix.

### 10.5 Provider Webhook and Failure Normalization

Normalize Resend and SES delivery events into a shared internal status vocabulary: delivered, deferred/transient failure, permanent failure, bounce, complaint, and suppressed. Expose safe user/admin status without retaining message bodies.

### 10.6 Tracking Protection Pipeline

Continue hardening tracking-pixel removal, optional tracking query cleanup, metadata-only records, conservative/aggressive mode clarity, and regression tests that preserve benign content.

### 10.7 Ansible Hardening Rollout

Codify host hardening with UFW, fail2ban, SSH key-only access/root-login restrictions, Caddy TLS/security headers, non-root service ownership, PM2/systemd restart safeguards, and backup/restore verification.

### 10.8 MFA and Admin Session Hardening

Strengthen dashboard and admin access with MFA for administrative accounts, session lifetime and refresh-token monitoring, audit trails for provider/domain/PGP/kill-switch changes, and alerts on suspicious login and token reuse behavior.

### 10.9 Monitoring and Alerts

Add operational alerts for queue depth, stale jobs, worker failures, retry rates, spam rate changes, provider API failures, bounce/complaint spikes, PGP-required rejection spikes, SMTP ingress availability, Redis health, and PostgreSQL health.

---

## 11. Explicit Non-Goals

ShieldMe’s current forwarding-first whitepaper explicitly excludes:

- Hosted user mailboxes.
- IMAP, POP3, or JMAP product support.
- Webmail, folders, drafts, searchable mailbox indexes, or mailbox exports.
- Zero-knowledge mailbox storage claims.
- Password-derived mailbox encryption claims.
- Quantum-safe or post-quantum email provider claims.
- Proton-style or ForwardEmail-style mailbox replacement positioning.
- Claims that plaintext never touches ShieldMe.
- Claims that OpenPGP forwarding is equivalent to encrypted mailbox hosting.

These may be future product-line decisions, but they are not part of the current ShieldMe forwarding-first model.

---

## 12. Safe Public Claims

ShieldMe can safely describe its current model with precise language:

- ShieldMe is a forwarding-first privacy service for custom-domain aliases.
- ShieldMe supports optional and required OpenPGP encrypted forwarding.
- ShieldMe does not store plaintext message bodies in PostgreSQL mail logs.
- ShieldMe uses metadata-minimized forwarding logs.
- ShieldMe runs inside a self-hosted trust boundary controlled by the operator.
- Recipient private keys are not stored by ShieldMe.
- Resend/SES receive ciphertext when OpenPGP forwarding is enabled and succeeds.
- ShieldMe is not a hosted mailbox provider.

Suggested public wording:

> ShieldMe is a forwarding-first privacy service for custom-domain email aliases. It forwards mail to your chosen inbox, stores metadata-only delivery logs, and can encrypt forwarded message bodies with your OpenPGP public key before outbound delivery. ShieldMe does not host mailboxes, does not provide IMAP/POP3/JMAP, and does not claim zero-knowledge mailbox storage.

---

## 13. PDF Export Note

This repository does not currently define a standard Markdown-to-PDF script in `package.json`. If a PDF version is needed, export this Markdown file using the project’s chosen documentation pipeline or an external tool such as Pandoc in a separate documentation build environment. Do not add heavy PDF tooling to the application runtime solely for this whitepaper.

---

## 14. Source Context

This whitepaper was written from ShieldMe’s current documentation and implementation context, including:

- `docs/security/shieldme-security-infrastructure.md`
- `docs/security/shieldme-quantum-safe-encryption-gap-analysis.md`
- `docs/security/shieldme-forwarding-first-upgrade-roadmap.md`
- `docs/security/forwardemail-benchmark-gap-analysis.md`
- `src/db/schema.ts`
- `src/smtp/smtp.server.ts`
- `src/queues/email-jobs.ts`
- `src/workers/forwarding.worker.ts`
- `src/modules/pgp/pgp.service.ts`
- `src/modules/tracking/tracking-protection.service.ts`

ForwardEmail’s technical whitepaper was reviewed only as a benchmark for themes such as threat modeling, architecture transparency, security protocols, and public trust documentation. This document is original to ShieldMe and intentionally stays within ShieldMe’s forwarding-first product scope.
