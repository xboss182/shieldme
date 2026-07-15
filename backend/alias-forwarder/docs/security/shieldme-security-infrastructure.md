# ShieldMe Security Infrastructure

**Version**: 1.0
**Date**: 2026-07-10
**Maintainer**: Documentation Writer
**Contact**: security@shieldme.cc
**Security Policy**: https://shieldme.cc/.well-known/security.txt

---

## 1. Security Architecture & Foreword

ShieldMe is a forwarding-first email alias privacy service for custom domains. Its security model is built around three principles: **data minimization**, **zero body storage in PostgreSQL mail logs**, and **self-hosted trust**.

### Privacy-First Forwarding Model

ShieldMe receives inbound email on behalf of user aliases and forwards it to verified recipient addresses. It does not index or retain message bodies as mailbox content. The service exists as a routing layer: mail is parsed and processed transiently for validation, abuse controls, optional OpenPGP encryption, and delivery, then discarded from the queue after delivery or terminal failure.

Unlike full mailbox providers, ShieldMe deliberately avoids mailbox storage. There is no hosted encrypted inbox, IMAP server, POP3 server, JMAP endpoint, webmail, folder hierarchy, or downloaded copy of your inbox. If you do not enable OpenPGP forwarding, the message body is held only transiently in a Redis/BullMQ job while delivery is in progress, then destroyed.

### Data Minimization

The only data ShieldMe retains long-term is bodyless metadata in the `mail_logs` table:

- Envelope sender / recipient
- Alias matched
- Forwarding outcome (delivered, bounced, rejected)
- SMTP authentication signals (SPF/DKIM/DMARC result codes — no headers, no body)
- `auth_failure_count` (integer 0–3)
- Timestamps

No message body, HTML body, attachment, or recipient address book is written to the database. Subject handling is limited to delivery/forwarding workflow needs and must not become mailbox storage.

### Self-Hosted Trust Boundary

ShieldMe runs on a single dedicated VPS at `152.42.211.146` (DigitalOcean Singapore region). The operator controls the full stack: OS, Caddy TLS termination, Node.js application, PostgreSQL, and Redis. There is no multi-tenant shared hosting, no third-party control plane, and no SaaS runtime dependency for the core forwarding path.

Outbound delivery is delegated to Resend or Amazon SES (see sections 3 and 6 for dependency analysis).

---

## 2. Infrastructure Security

### Host & Network

| Property | Value |
|---|---|
| VPS provider | DigitalOcean |
| IP address | 152.42.211.146 |
| Region | Singapore (sgp1) |
| Firewall | UFW — allow 22, 80, 443, 25, 2525; deny all else |
| Reverse proxy | Caddy (TLS 1.2/1.3, auto-HTTPS via Let's Encrypt / Google Trust Services) |

UFW allows only the minimum required ports:

- **22** — SSH (key-based auth)
- **80** — HTTP (Caddy redirects to HTTPS)
- **443** — HTTPS (all web traffic)
- **25** — SMTP inbound (public MX)
- **2525** — SMTP inbound (alternate port)

Redis (6379) and PostgreSQL (5432) bind to 127.0.0.1 only and are not externally reachable.

### Process Isolation

All ShieldMe processes run as dedicated system user `shieldme` (no login shell), managed by PM2 under systemd service `pm2-shieldme.service`. PM2 home: `/var/lib/shieldme/.pm2`.

| PM2 Process | Purpose | Port |
|---|---|---|
| alias-forwarder | REST API | 4005 |
| shieldme-worker | BullMQ forwarding worker | — |
| shieldme-smtp | SMTP ingress | 2525 |
| shieldme-site | Dashboard frontend | 3006 |

| Path | Owner | Mode |
|---|---|---|
| /opt/shieldme/alias-forwarder | shieldme:shieldme | 0750 |
| /opt/shieldme/alias-forwarder/.env | shieldme:shieldme | 0600 |
| /var/www/shieldme | shieldme:shieldme | 0750 |
| /var/www/shieldme/.env | shieldme:shieldme | 0600 |
| /var/lib/shieldme/.pm2 | shieldme:shieldme | 0700 |

### Reverse Proxy (Caddy)

Caddy terminates TLS for all public subdomains. Minimum negotiated TLS version is 1.2.

Caddy routing:

| Domain | Backend |
|---|---|
| shieldme.cc, www.shieldme.cc | Frontend SSR (port 3006) |
| app.shieldme.cc | Dashboard (port 3006) |
| api.shieldme.cc | REST API (port 4005) |
| mta-sts.shieldme.cc | Static MTA-STS policy |

Security headers on all public responses:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none';
  frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https:;
  script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
  connect-src 'self' https://api.shieldme.cc https://app.shieldme.cc
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

Note: `unsafe-inline` is retained in script-src/style-src because TanStack Start SSR injects inline bootstrapping. Removing it safely requires nonce/hash support in the build pipeline (roadmap item).

### Trust and Disclosure

- Security contact: security@shieldme.cc
- Security policy: https://shieldme.cc/.well-known/security.txt
- CAA records: pki.goog (Google Trust Services), letsencrypt.org, iodef to security@shieldme.cc

security.txt:

```
Contact: mailto:security@shieldme.cc
Preferred-Languages: en
Canonical: https://shieldme.cc/.well-known/security.txt
Policy: https://shieldme.cc/.well-known/security.txt
Expires: 2027-07-09T00:00:00Z
```

---

## 3. Email Security & Protocols

### SMTP Ingress

ShieldMe accepts inbound mail on port 25 (public MX) and 2525 (alternate). The SMTP server is a custom Node.js process (`shieldme-smtp`). STARTTLS is offered on both ports.

Mail flow on ingress:

1. SMTP session + EHLO exchange
2. STARTTLS negotiated
3. RCPT TO validated against alias table
4. DATA received and parsed by mailparser
5. Spam scan and auth-signal extraction
6. Job enqueued in BullMQ/Redis for forwarding worker
7. 250 OK returned; raw message buffer discarded from memory

### DNS Security Records

| Record | Status |
|---|---|
| DNSSEC | Live |
| CAA | Live (pki.goog + letsencrypt.org + iodef) |
| SPF | Live |
| DMARC | p=none (monitoring only — enforcement is a staged owner decision) |
| MTA-STS | Live (mode: testing; policy ID 20260709T233901Z) |
| TLS-RPT | Live (v=TLSRPTv1; rua=mailto:tlsrpt@shieldme.cc) |
| DANE/TLSA | Deferred — requires cert ownership validation before enabling |

DMARC progression from p=none to quarantine/reject is deliberately staged and gated on aggregate report monitoring to prevent forwarded mail loss.

### OpenPGP Forwarding Encryption

Users may provide an OpenPGP public key per alias. When set, the forwarding worker encrypts the message body using the recipient's key before outbound handoff, so Resend/SES receive ciphertext for the forwarded body when encryption succeeds.

Implementation (openpgp v5.11.3):

- Encryption is per-alias; aliases without a PGP key receive plaintext forwarded mail
- Invalid/expired PGP keys trigger a controlled error (no 500); mail queues for retry or bounces
- Key rotation is user-initiated via dashboard

OpenPGP protects the forwarded copy to a recipient-controlled key. It is not a zero-knowledge hosted mailbox model and does not protect the transient copy in the Redis/BullMQ queue before encryption (see section 6).

### Outbound Delivery

Outbound mail is handed to Resend (primary) or Amazon SES (fallback), both configured via environment variables. ShieldMe does not currently operate its own outbound MTA.

DKIM signing is currently owned by the outbound ESP (Resend/SES), not by ShieldMe directly. DKIM alignment for forwarded mail therefore depends on the ESP's signing key rather than a ShieldMe-controlled key (see section 6).

---

## 4. Anti-Abuse & Rate Limiting

### Rate Limits

| Layer | Limit | Notes |
|---|---|---|
| Login attempts | 5 failures / 15 min per IP | express-rate-limit; IPv6-normalized keys; skipSuccessfulRequests |
| Per-alias forwarding | Configurable per alias | Prevents relay abuse |
| Global API | Per-IP request limit | Applied before route handlers |
| Oversized payloads | 413 response | Controlled rejection |
| Bad JSON | 400 response | Controlled rejection |

### Sender Blocklist

Per-alias and global sender blocklists suppress mail from specific envelope senders matched against MAIL FROM. Blocked senders receive a silent drop or controlled rejection.

### Bounce Suppression

Bounce events from Resend (via HMAC-verified webhook) and SES are processed to suppress future delivery to hard-bounced addresses. This prevents mail loops and protects sender reputation.

### Spam Scanner

Integration with spamscanner.net classifies inbound messages. Messages may be tagged (subject prefix) or rejected based on an operator-configured score threshold.

### Kill Switch

A disk-backed global forwarding kill switch halts all outbound forwarding without a code deploy. The worker stops processing queue jobs; existing jobs are preserved in Redis for replay. State is visible via GET /api/admin/security-events.

---

## 5. Data Protection, Minimization & Backups

### Zero-Storage Policy for Email Bodies

Email bodies are never written to PostgreSQL. The forwarding flow:

1. SMTP ingest — parsed in memory
2. Metadata extracted (sender, recipient, auth signals)
3. Payload enqueued in Redis/BullMQ (transient)
4. Worker forwards via ESP
5. Redis job deleted after terminal state (success or max retries)

The mail_logs table stores only:

- alias_id, sender, recipient (envelope-level)
- status, forwarded_at, error_message
- auth_results (JSON: SPF/DKIM/DMARC codes + raw header truncated to 1000 chars)
- auth_failure_count (integer 0–3)

### Secrets Management

| Secret | Purpose |
|---|---|
| DATABASE_URL | PostgreSQL connection string |
| REDIS_URL | Redis connection string |
| JWT_ACCESS_SECRET | Access token signing |
| JWT_REFRESH_SECRET | Refresh token signing |
| RESEND_WEBHOOK_SECRET | Webhook HMAC verification |
| RESEND_API_KEY | Runtime-configured via admin API |

ADMIN_SECRET is deprecated; remains only as break-glass until admin account migration is confirmed.

Refresh tokens are single-use. Reusing a consumed token returns 401, clears the session, and logs `auth.refresh_token_reuse_detected`.

### Encrypted Offsite Backups

`scripts/backup-db.sh` produces:

- pg_dump compressed with gzip + SHA-256 checksum
- Retention: 30 daily, 12 monthly
- Each backup verified by scripts/verify-restore.sh; periodic full restores into an isolated test DB confirm recoverability
- Backups stored offsite (Backblaze B2 / S3-compatible)

Redis persistence checked via `scripts/check-redis-persistence.sh`. Redis eviction policy must be `noeviction` (required for BullMQ reliability).

### SOC 2 Type I Readiness

Completed internal readiness stages (14–22): policy authoring, control documentation, external scan remediation, non-root service hardening, and public trust page publication.

Internal verdict: ship-ready for external penetration test and SOC 2 Type I readiness review.

**ShieldMe is not SOC 2 certified.** External certification requires an accredited auditor and a formal audit window. Type II additionally requires a defined evidence period and recurring proof of control operation.

Compliance docs:

- docs/compliance/auditor-handoff-packet.md
- docs/compliance/soc2-type-i-control-summary.md
- docs/compliance/owner-decision-checklist.md
- docs/policies/ (full policy set)

---

## 6. Disadvantages & Gaps of Current Setup (Compared to ForwardEmail)

### 6.1 No Mailbox Hosting, IMAP, or POP3

ForwardEmail supports stored mailboxes via IMAP4rev1 and POP3. ShieldMe is forwarding-only. If the downstream recipient address fails permanently, the message is lost — there is no fallback inbox. ShieldMe is not a hosted encrypted mailbox provider and should not be positioned as a Proton/ForwardEmail-style mailbox replacement in its current form.

### 6.2 Dependency on Third-Party Outbound ESPs

All outbound delivery passes through Resend (primary) or Amazon SES (fallback). ShieldMe does not operate its own outbound MTA. Consequences:

- **Deliverability dependency**: Resend/SES outage or account suspension halts all forwarding.
- **DKIM alignment gap**: The DKIM d= tag belongs to the ESP, not shieldme.cc. Some receiving servers score forwarded mail lower as a result.
- **Privacy surface**: Message bodies are visible to the ESP in transit unless PGP-encrypted end-to-end by the original sender.

### 6.3 Single-Node VPS Without Geographic Redundancy

The entire stack (API, worker, SMTP, DB, Redis) runs on one VPS. There is no:

- Secondary MX to accept mail during primary node outages
- Database replica or hot standby
- Geographic failover or load distribution

A VPS-level failure halts all mail ingress and forwarding until the node recovers. Mail sent during an outage may bounce permanently depending on the sending server's retry window (typically 4–5 days, but shorter for some providers).

### 6.4 No Local DKIM Signing or SRS

**DKIM**: Forwarded messages are not signed with ShieldMe's own DKIM key. Outbound DKIM is owned by the ESP. If forwarding modifies the message (e.g., subject tagging, spam header injection), the original sender's DKIM signature may break.

**SRS (Sender Rewriting Scheme)**: ShieldMe does not implement SRS. Forwarded mail preserves the original envelope MAIL FROM, which fails SPF at the downstream recipient because the message arrives from ShieldMe's IP rather than the original sender's SPF-authorized IP. Without SRS, forwarded mail is at elevated risk of SPF failures and DMARC rejection downstream.

### 6.5 Plaintext Transient Email in Redis/BullMQ Queue

Message payloads are stored in cleartext in Redis memory — and in RDB/AOF snapshots on disk if persistence is enabled — for the duration of the forwarding job. While Redis is bound to 127.0.0.1:

- A host-level compromise with Redis access exposes message bodies currently in-flight
- Redis dump files or RDB snapshots contain cleartext message content
- A crashed worker leaves the message body in Redis until the job times out

This is the most significant data-minimization gap in the current architecture.

---

## 7. Forwarding-First Upgrade Roadmap

ShieldMe will remain a forwarding-first privacy service, not a mailbox provider. The detailed execution plan is maintained in [ShieldMe Forwarding-First Security Upgrade Roadmap](./shieldme-forwarding-first-upgrade-roadmap.md).

### 7.1 In-Queue Payload Encryption for Redis/BullMQ — Priority: High

Encrypt message body fields in BullMQ job payloads before writing to Redis. Decrypt in the worker before forwarding or PGP encryption. Use AES-256-GCM or ChaCha20-Poly1305 with a symmetric key from the environment (never stored in Redis).

Closes the most significant data-minimization gap. Effort: medium — requires a job payload encryption/decryption wrapper around the BullMQ add/process lifecycle. Key rotation requires a migration strategy for in-flight jobs.

### 7.2 PGP Forwarding UX and Policy — Priority: High

Clarify `none`, `optional`, and `required` PGP modes in the dashboard and docs. Add key validation, expiration warnings, test encrypted delivery, key rotation guidance, and protected/unprotected indicators for aliases and recipients.

Required mode must never downgrade to plaintext when a valid recipient key is unavailable or encryption fails.

### 7.3 Outbound Delivery and Authentication Hardening — Priority: High

Evaluate local DKIM signing and SRS/forwarding-safe envelope rewriting where appropriate. Define Resend/SES fallback behavior so PGP-required messages never leak plaintext. Continue DMARC alignment monitoring before enforcement changes.

### 7.4 Delivery Failure Handling — Priority: High

Normalize Resend/SES webhook events, suppress bounces and complaints, expose user/admin-visible delivery failure status, and define retry/dead-letter behavior that does not store bodies.

### 7.5 Tracking Protection — Priority: Medium

Strip or neutralize tracking pixels and optionally clean tracking query parameters. Store only safe metadata such as count, action, and reason; never store body content.

### 7.6 Infrastructure Hardening — Priority: Medium

Apply the MNC-448 Ansible baseline for UFW, fail2ban, SSH hardening, Caddy TLS/security headers, service isolation under non-root `shieldme`, and PM2/systemd restart safeguards.

### 7.7 Backup MX / Resilience Without Mailbox Product — Priority: Medium

Deploy secondary MX only as queue-and-forward infrastructure. It must not create user mailboxes or expose IMAP/POP3/JMAP. Any stored transient payloads must be encrypted and removed after TTL or terminal state.

### 7.8 Public Claims / Marketing Safety — Priority: High

Safe claims: forwarding-first privacy model, optional or required OpenPGP encrypted forwarding, metadata-only mail-log database, no message body persistence in PostgreSQL, self-hosted trust boundary, and recipient-controlled decryption when OpenPGP is enabled.

Avoid claims that ShieldMe is a quantum-safe email provider, zero-knowledge mailbox, encrypted mailbox host, hosted encrypted inbox, full Proton/ForwardEmail mailbox replacement, post-quantum secure email service, or that plaintext never touches ShieldMe.

---

## Appendix: Key Paths & Commands

### File Paths

```
/opt/shieldme/alias-forwarder/           # Backend runtime (production)
/opt/shieldme/alias-forwarder/.env       # Secrets (0600 shieldme:shieldme)
/opt/shieldme/ecosystem.config.cjs      # PM2 process definitions
/var/www/shieldme/                       # Frontend runtime
/var/www/shieldme/.env                   # Frontend env (0600 shieldme:shieldme)
/var/www/shieldme-security/.well-known/security.txt
/etc/caddy/Caddyfile                     # Reverse proxy config
/root/alias-forwarder/docs/security/     # Security documentation (docs mirror)
/root/alias-forwarder/docs/compliance/   # Audit / SOC 2 readiness docs
/root/alias-forwarder/docs/policies/     # Control policies
```

### Commands

```bash
# Check PM2 process status
sudo -u shieldme pm2 list

# View recent security events (replace *** with ADMIN_SECRET)
curl -s -H "Authorization: Bearer ***" https://api.shieldme.cc/api/admin/security-events

# Verify security headers
curl -sSI https://shieldme.cc/

# Check security.txt
curl -s https://shieldme.cc/.well-known/security.txt

# Run database backup
sudo -u shieldme bash /root/alias-forwarder/scripts/backup-db.sh

# Check Redis persistence
bash /root/alias-forwarder/scripts/check-redis-persistence.sh

# Validate Caddy config
caddy validate --config /etc/caddy/Caddyfile
```

---

## Related Documents

- [Compliance / SOC 2 Readiness](../compliance/soc2-type-i-control-summary.md)
- [External Scan Remediation](./external-scan-remediation.md)
- [ForwardEmail Benchmark Gap Analysis](./forwardemail-benchmark-gap-analysis.md)
- [Safe Public Claims Checklist](./safe-public-claims-checklist.md)
- [Security Review Report](./security-review-report.md)
- [Security Operations](../security-operations.md)
- [Risk Register](../policies/risk-register.md)
- [Incident Response Plan](../policies/INCIDENT-RESPONSE-PLAN.md)
