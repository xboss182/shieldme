# ForwardEmail Benchmark Gap Analysis — ShieldMe

Date: 2026-07-10
Issue: MNC-397
Inputs:
- https://forwardemail.net/en/security
- https://forwardemail.net/en/blog/docs/best-quantum-safe-encrypted-email-service
- https://forwardemail.net/en/blog/docs/email-protocols-rfc-compliance-imap-smtp-pop3-comparison
- https://forwardemail.net/technical-whitepaper.pdf

## Executive Summary

ShieldMe is in a strong state for the original MVP scope: custom-domain aliases, verified recipients, inbound SMTP capture, Resend forwarding, abuse controls, admin kill-switch, SOC 2 readiness docs, non-root services, and external DNS/security hardening.

Compared with ForwardEmail, ShieldMe is not yet a full email provider. ForwardEmail's core differentiators are full mailbox hosting, IMAP/POP3/SMTP protocol depth, encrypted per-user mailbox storage, public transparency/security material, and mature mail-auth/deliverability controls. ShieldMe currently fits the "secure alias forwarding MVP" category, not the "privacy-first encrypted mailbox provider" category.

## What ShieldMe Already Matches Well

| Area | ForwardEmail benchmark | ShieldMe current state | Gap |
|---|---|---|---|
| Custom-domain aliases | Unlimited domains/aliases | Custom-domain alias MVP implemented | Mostly aligned for MVP |
| Inbound SMTP | MX receives inbound mail | ShieldMe SMTP ingress on port 2525 behind MX path | MVP-level, not full RFC platform |
| Forwarding | Forward to destination recipients | Resend forwarding worker implemented | Aligned for MVP |
| Recipient trust | Controlled recipients/users | Verified recipient flow implemented | Aligned |
| Abuse controls | Rate limiting, abuse handling | Alias/user rate limits, blocklists, loop/auto-reply checks, kill-switch | Good MVP baseline |
| Web/security headers | Public security posture | CSP, HSTS, XFO, XCTO, referrer-policy, security.txt | Good after Stage 20 |
| DNS/mail security | SPF/DMARC/MTA-STS/TLS-RPT/DNSSEC/DANE posture | DNSSEC, CAA, MTA-STS testing, TLS-RPT live; DMARC p=none; DANE deferred | Good baseline, enforcement still pending |
| SOC/security docs | Security practices and transparency | SOC 2 readiness pack, policies, risk register, auditor handoff packet | Internal docs good; public docs thin |
| Service hardening | Non-root, backups, monitoring | Non-root PM2 service user, backups/evidence scripts, Redis noeviction | Good |

## Major Gaps Versus ForwardEmail

### 1. Full mailbox hosting: missing by design
ForwardEmail supports stored mailboxes with IMAP and POP3. ShieldMe currently forwards mail and logs metadata, but does not host user mailboxes.

Impact: ShieldMe cannot yet compete as an email account provider. It competes as a forwarding/alias product.

Improvement if desired:
- Add mailbox storage as a separate product line, not a patch to forwarding.
- Decide storage model: encrypted SQLite-per-mailbox, Postgres-backed mailbox, or external mailbox provider.
- Add mailbox quota, folder model, deletion/export, backup/restore, and retention semantics.

Priority: Product-strategic, large build.

### 2. IMAP/POP3 access: missing
ForwardEmail documents IMAP4rev1, POP3, protocol extensions, RFC differences, and client behavior. ShieldMe has inbound SMTP only and no IMAP/POP3 server.

Impact: Users cannot connect Apple Mail/Thunderbird/mobile mail clients to ShieldMe as a mailbox provider.

Improvement if desired:
- Create Stage: IMAP/POP3 mailbox access feasibility.
- Evaluate WildDuck/Stalwart/Mailu-style integration versus building protocol servers directly.
- Define RFC support matrix before implementation.

Priority: Product-strategic, very large build.

### 3. Outbound SMTP service: partial/missing
ForwardEmail provides outbound SMTP submission and DKIM signing. ShieldMe forwards outbound through Resend and does not currently expose a customer-facing outbound SMTP submission service.

Impact: ShieldMe is dependent on Resend and cannot advertise full email sending infrastructure.

Improvement needed for provider parity:
- Add outbound SMTP submission API/server or keep Resend as explicit provider dependency.
- Add DKIM signing ownership per customer domain or verify Resend's DKIM alignment path.
- Add bounce/complaint processing and deliverability dashboard.
- Add SRS/return-path strategy for forwarded mail deliverability.

Priority: High if product goal is ForwardEmail-like; medium if remaining forwarding-only.

### 4. Zero-knowledge / quantum-safe encrypted mailbox storage: missing
ForwardEmail's strongest privacy claim is individually encrypted SQLite mailboxes using user-held passwords and ChaCha20-Poly1305. ShieldMe does optional OpenPGP encryption before forwarding, but does not store encrypted mailboxes.

Impact: ShieldMe should not claim zero-knowledge mailbox storage or quantum-safe encrypted mailbox service.

Improvement if desired:
- For forwarding-only: present PGP mode honestly as recipient-side content encryption, not zero-knowledge mailbox storage.
- For mailbox product: design per-mailbox encryption, key derivation, recovery semantics, backup encryption, and export/delete flow.

Priority: High for privacy-provider positioning; low for forwarding MVP.

### 5. Public transparency/security pages: incomplete
ForwardEmail has public security practices, protocol compliance, privacy explanations, whitepaper-level architecture, and benchmark claims. ShieldMe has internal docs and security.txt, but limited public-facing trust content.

Impact: External users/auditors have less self-serve trust material.

Improvement needed:
- Publish `/security` page with security model, encryption model, infrastructure, reporting, backups, incident response, and contact info.
- Publish `/privacy` or data-handling page explaining what is stored, forwarded, logged, retained, and deleted.
- Publish `/protocols` or `/mail-security` page describing SPF/DKIM/DMARC/MTA-STS/TLS-RPT/DANE posture and limitations.
- Link `security.txt` Policy to the public vulnerability disclosure page, not to itself.

Priority: High, small-to-medium build.

### 6. DMARC enforcement remains monitoring-only
ShieldMe still has DMARC `p=none`, intentionally. ForwardEmail presents stronger SPF/DMARC support and enforcement posture.

Impact: Good for safe rollout, but not final mature posture.

Improvement needed:
- Monitor aggregate DMARC reports first.
- Move to `p=quarantine; pct=25`, then 50, then 100.
- Move to `p=reject` only after SPF/DKIM alignment is confirmed for all legitimate senders.

Priority: High, staged ops change.

### 7. DANE/TLSA deferred
ForwardEmail highlights DANE/DNSSEC. ShieldMe has DNSSEC, but DANE/TLSA remains deferred because Cloudflare-managed cert rotation and SMTP certificate ownership must be validated first.

Impact: Not a blocker for SOC 2, but a benchmark gap.

Improvement needed:
- Decide if SMTP certificate chain is stable and owned by us.
- Add TLSA records only after renewal automation is clear.
- Monitor expiry/rotation or avoid DANE to prevent mail breakage.

Priority: Medium; risky if rushed.

### 8. RFC compliance matrix: missing
ForwardEmail publicly documents what it supports and where it deviates from RFCs. ShieldMe has tests, but no external RFC/protocol compliance matrix.

Impact: Fine for MVP, weak for technical buyer trust.

Improvement needed:
- Document inbound SMTP support: STARTTLS path, SIZE, 8BITMIME, SMTPUTF8, DSN, error semantics.
- Document unsupported protocols: IMAP, POP3, JMAP, outbound SMTP submission.
- Add automated SMTP protocol test coverage where practical.

Priority: Medium.

### 9. Mail authentication verification depth: incomplete/unclear
ForwardEmail references DKIM/SPF/DMARC verification and enforcement. ShieldMe has domain DNS guidance and Resend forwarding, but inbound SPF/DKIM/DMARC validation is not clearly implemented as an enforcement layer.

Impact: Abuse/spoofing signals are weaker than mature providers.

Improvement needed:
- Add inbound SPF/DKIM/DMARC authentication result parsing/verification.
- Store Authentication-Results in mail logs.
- Use auth results in abuse scoring and forwarding decisions.
- Add admin/reporting view for spoofing/auth failures.

Priority: High for email security maturity.

### 10. Security claims need careful positioning
ForwardEmail uses strong language: open-source, zero-knowledge, quantum-resistant, encrypted mailbox, full protocol provider. ShieldMe should avoid those claims until implemented.

Recommended positioning now:
- "Secure alias forwarding for custom domains."
- "SOC 2 Type I ready internally; external certification pending."
- "Optional OpenPGP recipient encryption."
- "MTA-STS/TLS-RPT/CAA/security.txt deployed."
- "DMARC enforcement and DANE are staged owner decisions."

Avoid claiming:
- Full encrypted mailbox provider.
- Quantum-safe email service.
- Zero-knowledge storage.
- Full IMAP/POP3/SMTP provider.
- SOC 2 certified.

## Prioritized Improvement Roadmap

### P0: Public trust and accuracy
1. Publish a public security page.
2. Publish a public privacy/data-handling page.
3. Update `security.txt` Policy to point to the public vulnerability disclosure/security page.
4. Add a public mail-security posture page listing SPF/DKIM/DMARC/MTA-STS/TLS-RPT/DANE status.

### P1: Mail authentication and deliverability maturity
1. Add inbound SPF/DKIM/DMARC verification and store results.
2. Add SRS or equivalent return-path strategy for forwarding deliverability.
3. Build DMARC report monitoring and staged progression to quarantine/reject.
4. Add bounce/complaint webhook processing if not already fully covered.

### P2: Protocol and RFC transparency
1. Publish ShieldMe protocol support matrix.
2. Add SMTP feature/extension tests.
3. Document unsupported protocols clearly: IMAP, POP3, JMAP, outbound SMTP submission.

### P3: Privacy/encryption expansion
1. Improve current PGP UX: key rotation, expiry warnings, required/optional policy clarity, test-send encrypted sample.
2. Decide whether encrypted mailbox hosting is in roadmap.
3. If yes, create a separate architecture spike for per-mailbox encrypted storage and IMAP/POP3 access.

### P4: Advanced DNS/mail hardening
1. Keep MTA-STS in `testing`, review TLS-RPT reports, then move to `enforce`.
2. Evaluate DANE/TLSA only after cert ownership and renewal automation are stable.
3. Periodically rerun Hardenize, Internet.nl web+mail, SSL Labs, and Mozilla Observatory.

## Verdict

ShieldMe is strong for a secure alias-forwarding MVP and has gone beyond baseline with SOC 2 readiness, non-root runtime hardening, and external DNS/web security remediation.

Compared to ForwardEmail, the biggest remaining gaps are product scope and transparency: no hosted mailbox storage, no IMAP/POP3, no customer outbound SMTP service, no zero-knowledge encrypted mailbox model, and no public ForwardEmail-style security/protocol whitepaper. The most valuable next step is not to build all of ForwardEmail immediately; it is to publish accurate public trust docs and strengthen mail-auth/deliverability controls while keeping the product positioned as forwarding-first.
