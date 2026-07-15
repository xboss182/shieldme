# ShieldMe Quantum-Safe / Encrypted Email Gap Analysis

Date: 2026-07-11
Issue: MNC-447
Reference benchmark: ForwardEmail article, “Best Quantum-Safe Encrypted Email Service”

## 1. Executive Summary

ShieldMe is currently a secure alias-forwarding product, not a hosted encrypted mailbox provider.

ShieldMe’s strongest privacy property today is forwarding-first data minimization: it receives inbound mail for an alias, logs only delivery metadata in PostgreSQL, and forwards the message to a verified recipient. It can optionally encrypt the forwarded message body with the recipient’s OpenPGP public key before handing it to the outbound provider.

ShieldMe does **not** currently provide quantum-safe encrypted mailbox storage. It has no hosted mailbox, no IMAP/POP3/JMAP mailbox access, and no zero-knowledge per-mailbox storage system. Plaintext can exist transiently inside the self-hosted forwarding path before optional PGP encryption occurs.

Safe positioning today:

- ShieldMe is a **secure alias-forwarding service**.
- ShieldMe supports **optional or required OpenPGP encrypted forwarding** to recipients that provide public keys.
- ShieldMe stores **metadata-only mail logs** and does not store message bodies in `mail_logs`.
- ShieldMe should **not** claim “quantum-safe email service,” “zero-knowledge mailbox,” or “encrypted mailbox hosting” until those systems exist.

## 2. Current ShieldMe Encryption Model

### Current mail flow

1. A sender sends normal SMTP mail to a ShieldMe alias.
2. ShieldMe receives the message on the self-hosted VPS forwarding stack.
3. ShieldMe validates the alias and enqueues a BullMQ/Redis forwarding job.
4. The forwarding worker composes the forwarded message.
5. If the alias has PGP enabled and a recipient public key exists, ShieldMe encrypts the forwarded body with the recipient’s OpenPGP public key.
6. ShieldMe sends the forwarded message through the configured outbound provider, currently Resend primary or Amazon SES fallback.
7. The recipient decrypts locally with their private key when PGP encryption was used.

### OpenPGP forwarding modes

ShieldMe supports per-alias PGP modes:

- `none`: forward normally without PGP encryption.
- `optional`: encrypt when a recipient public key exists; otherwise forward plaintext.
- `required`: reject delivery if a recipient public key is missing or encryption fails.

The code stores recipient public keys in `pgp_keys.public_key_armored` and does not store recipient private keys. This is the correct trust boundary for forwarding encryption: the recipient controls decryption by keeping the private key outside ShieldMe.

### What is encrypted today

When PGP is enabled and succeeds:

- The final forwarded body sent through Resend/SES is armored OpenPGP ciphertext.
- Resend/SES receive ciphertext for the message body.
- The downstream mailbox provider receives ciphertext for the body.
- Only the recipient with the matching private key can decrypt the content locally.

### What is not encrypted today

ShieldMe is still a forwarding pipeline, so the message can be plaintext before the PGP step:

- The inbound SMTP sender usually sends normal plaintext mail to the alias, unless the sender independently used end-to-end encryption.
- ShieldMe parses and processes the message on the self-hosted VPS before outbound delivery.
- BullMQ/Redis queue payloads include fields such as `subject`, `textBody`, and `htmlBody`, so queued jobs may contain plaintext before the worker encrypts the outbound copy.
- PGP encryption is performed in the worker immediately before outbound delivery, not at SMTP ingress.

### Database storage model

ShieldMe’s `mail_logs` table is metadata-only. It stores delivery and security metadata such as:

- Envelope sender and recipient.
- Alias ID.
- Forwarding status and failure reason.
- Outbound provider/message ID.
- Authentication results.
- Spam scan metadata.
- PGP mode/encryption status.
- Timestamps.

It does not store message body, HTML body, attachments, or full mailbox content. This supports ShieldMe’s forwarding-first privacy model, but it is different from encrypted mailbox hosting.

## 3. ForwardEmail Model to Compare Against

ForwardEmail positions its encrypted email product around capabilities that are outside ShieldMe’s current product scope:

- Hosted mailbox storage.
- Individually encrypted mailbox data.
- SQLite-per-mailbox style storage architecture.
- ChaCha20-Poly1305 authenticated encryption for stored mailbox data.
- User-held password/key material used to protect mailbox contents.
- IMAP/POP3 mailbox access for mail clients.
- A privacy-provider narrative around encrypted mailbox hosting and quantum-safe/resistant storage choices.

These are useful benchmark capabilities, not current ShieldMe capabilities.

The important distinction is product category:

| Area | ShieldMe today | ForwardEmail benchmark |
|---|---|---|
| Primary product | Alias forwarding | Email provider / mailbox hosting |
| Stored mailbox | No | Yes |
| IMAP/POP3/JMAP | No | IMAP/POP3 documented |
| Long-term body storage | No mailbox body storage in `mail_logs` | Encrypted mailbox storage |
| Encryption focus | Recipient-side OpenPGP forwarding | Encrypted mailbox-at-rest model |
| Key control | Recipient holds OpenPGP private key | User-held mailbox password/key material |
| Quantum-safe claim readiness | Not ready | Claimed as part of benchmark positioning |

## 4. Disadvantages / Gaps in ShieldMe Today

### No hosted mailbox storage

ShieldMe does not store user inboxes. If a recipient wants a searchable mailbox, folders, drafts, or long-term message retention, that remains with the downstream mailbox provider.

### No IMAP/POP3/JMAP mailbox access

ShieldMe does not expose mailbox protocols. Users cannot connect Apple Mail, Thunderbird, mobile mail clients, or other IMAP/POP3/JMAP clients to ShieldMe as their mailbox provider.

### No zero-knowledge per-mailbox storage architecture

Because ShieldMe does not host mailboxes, it also does not have per-mailbox encryption domains, per-user mailbox keys, password-derived mailbox encryption, encrypted folder indexes, encrypted search indexes, or mailbox backup/export semantics.

### No post-quantum / quantum-safe mailbox encryption design

ShieldMe has not designed or implemented a post-quantum mailbox encryption architecture. OpenPGP forwarding can protect outbound content for recipients that provide keys, but that is not the same as quantum-safe mailbox hosting.

### Plaintext exists transiently on the self-hosted forwarder

Most inbound SMTP mail arrives as normal email content. ShieldMe must receive, parse, validate, scan, and prepare it before optional PGP encryption. The self-hosted VPS is therefore inside the trust boundary for transient plaintext processing.

### Redis/BullMQ queue payloads may contain plaintext

Current queue jobs can include `subject`, `textBody`, and `htmlBody`. Unless queue payload encryption is added, Redis memory and Redis persistence files may contain plaintext in-flight message content until jobs complete or expire.

This is the highest-value privacy gap to close inside the existing forwarding product because it reduces exposure without requiring a full mailbox product.

### Private-key recovery UX and key rotation are incomplete as a product feature

ShieldMe stores recipient public keys only. That is correct for security, but it means ShieldMe cannot recover a lost recipient private key. A complete customer-facing PGP feature set would need clearer UX for:

- Explaining that ShieldMe cannot decrypt or recover PGP-protected messages.
- Testing encrypted delivery before enforcing required mode.
- Warning about expiring keys.
- Rotating keys safely.
- Handling required-mode failures in a user-friendly way.

## 5. Forwarding-First Upgrades Worth Taking

ShieldMe will stay a forwarding-first privacy product. The upgrade path should therefore harden transient processing, PGP forwarding, outbound delivery, and public claims without adding mailbox hosting or mailbox protocols. See the dedicated roadmap: [ShieldMe Forwarding-First Security Upgrade Roadmap](./shieldme-forwarding-first-upgrade-roadmap.md).

### Queue payload encryption for transient email content

Add encryption around BullMQ job payloads before writing to Redis. Decrypt only inside the forwarding worker just before delivery. AES-256-GCM or ChaCha20-Poly1305 with a server-held key would reduce exposure from Redis memory, Redis snapshots, and worker crash residue.

This is not zero-knowledge mailbox encryption, but it is the most practical near-term privacy improvement for ShieldMe’s existing architecture.

### Stronger PGP lifecycle UX

Improve the customer-facing PGP flow:

- Key rotation flow.
- Key expiry warnings.
- Test encrypted delivery button.
- Clear optional vs required mode explanations.
- Delivery failure messaging for required mode.
- Dashboard indicators for protected/unprotected aliases and recipients.
- Documentation that ShieldMe stores public keys only and cannot recover private keys.

### Outbound delivery and failure hardening

Improve forwarding reliability and authentication without changing the product category:

- Evaluate local DKIM signing where appropriate.
- Add SRS/forwarding-safe envelope rewriting if needed.
- Normalize Resend/SES webhook events.
- Suppress hard bounces and complaints.
- Ensure provider fallback never downgrades PGP-required messages to plaintext.

### Clear public wording

Public documentation should distinguish:

- “PGP-encrypted forwarding” — current ShieldMe capability.
- “Zero-knowledge encrypted mailbox hosting” — not current ShieldMe capability.
- “Quantum-safe encrypted mailbox service” — not current ShieldMe capability.

Mailbox-hosting work, encrypted mailbox storage, IMAP/POP3/JMAP, and Proton/ForwardEmail-style mailbox replacement are out of scope for the forwarding-first roadmap.

## 6. Recommended Claim Language

### Safe claims ShieldMe can use now

- “Optional OpenPGP encrypted forwarding.”
- “Required PGP mode available for aliases that must not forward plaintext when no key is configured.”
- “No plaintext message body stored in the database.”
- “Metadata-only `mail_logs` table.”
- “Self-hosted trust boundary.”
- “Forwarding-first privacy model.”
- “Recipient-controlled decryption when OpenPGP forwarding is enabled.”
- “Resend/SES receive ciphertext when PGP encryption is enabled and succeeds.”

### Claims ShieldMe should avoid today

- “Quantum-safe email provider.”
- “Zero-knowledge mailbox.”
- “Encrypted mailbox storage.”
- “Hosted encrypted inbox.”
- “Full replacement for Proton/ForwardEmail mailbox hosting.”
- “No plaintext ever touches ShieldMe.”
- “Post-quantum secure email service.”

### Suggested precise wording

> ShieldMe is a secure alias-forwarding service with optional OpenPGP encrypted forwarding. When enabled, ShieldMe encrypts the forwarded message body to the recipient’s public key before outbound delivery, so the recipient decrypts locally with their private key. ShieldMe does not currently provide hosted encrypted mailbox storage, IMAP/POP3/JMAP mailbox access, or a quantum-safe mailbox architecture.

## 7. Roadmap Priority Table

| Upgrade | Risk reduced | Implementation cost | Recommended priority |
|---|---|---:|---|
| Encrypt BullMQ/Redis queue payloads | Reduces plaintext exposure in Redis memory, persistence, and crash residue | Medium | P0 / High |
| PGP required-mode UX polish | Reduces accidental plaintext forwarding and customer confusion | Low-Medium | P0 / High |
| PGP key expiry warnings | Reduces delivery failures from expired keys | Low | P1 / High |
| Test encrypted delivery flow | Lets users verify local decryption before enforcing PGP | Low-Medium | P1 / High |
| PGP key rotation workflow | Reduces long-lived key risk and supports operational hygiene | Medium | P1 / High |
| Public encryption model page | Reduces legal/marketing overclaim risk | Low | P0 / High |
| Clear “not a mailbox provider” documentation | Reduces customer misunderstanding and support burden | Low | P0 / High |
| Per-mailbox encrypted storage architecture spike | Defines path if ShieldMe expands into hosted mailboxes | Medium planning / High build | P2 / Strategic |
| IMAP/POP3/JMAP feasibility study | Clarifies cost of becoming a mailbox provider | Medium | P3 / Strategic |
| Hosted encrypted mailbox product | Enables ForwardEmail/Proton-style positioning | Very high | Future product line only |
| Post-quantum mailbox encryption design | Enables future quantum-safe claims for stored mailboxes | High-Very high | Future product line only |

## 8. Bottom Line

ShieldMe can honestly market itself today as a secure, self-hosted, forwarding-first privacy product with optional OpenPGP encrypted forwarding and metadata-only mail logs.

ShieldMe should not market itself as a quantum-safe email service or zero-knowledge encrypted mailbox provider until it actually ships hosted mailbox storage, a mailbox encryption architecture, mailbox access protocols, and a post-quantum/quantum-safe design appropriate for stored email.

The best near-term upgrade from the ForwardEmail comparison is not to copy mailbox claims. It is to harden ShieldMe’s forwarding model by encrypting transient queue payloads, improving PGP lifecycle UX, and publishing precise public language that explains the difference between PGP-encrypted forwarding and encrypted mailbox hosting.
