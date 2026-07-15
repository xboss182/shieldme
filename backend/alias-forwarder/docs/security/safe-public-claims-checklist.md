# ShieldMe Safe Public Claims Checklist

**Date**: 2026-07-11
**Scope**: Public trust, security, privacy, roadmap, and marketing copy for ShieldMe.

Use this checklist before publishing any ShieldMe-facing copy. The goal is to keep ShieldMe accurately positioned as a forwarding-first privacy service, not a hosted encrypted mailbox provider.

## Product Boundary

Public copy must clearly state:

- ShieldMe is a forwarding-first email alias privacy service.
- ShieldMe forwards mail to recipient-controlled inboxes; it does not host user mailboxes.
- ShieldMe avoids IMAP, POP3, JMAP, webmail, folders, drafts, searchable mailbox indexes, and mailbox exports.
- OpenPGP protects the forwarded content to recipient-controlled keys when enabled; it is not zero-knowledge hosted mailbox storage.
- Recipient private keys remain outside ShieldMe. ShieldMe stores recipient public keys only.

## Safe Claims

These claims are allowed when they match the current implementation:

- Forwarding-first privacy model for custom-domain aliases.
- Optional OpenPGP encrypted forwarding.
- Required PGP mode for aliases that must not forward plaintext without a valid recipient public key.
- Metadata-only database records for mail logs.
- No message body persistence in PostgreSQL mail logs.
- Self-hosted trust boundary controlled by the operator.
- Recipient-controlled decryption when OpenPGP forwarding is enabled.
- Resend/SES receive ciphertext for the forwarded body when OpenPGP encryption succeeds.

## Required Caveats

Include these caveats when discussing encryption or privacy:

- Normal SMTP messages can be plaintext before optional OpenPGP forwarding encryption.
- ShieldMe must transiently receive, parse, validate, scan, and route inbound messages.
- Current Redis/BullMQ jobs may be a transient privacy surface unless queue payload encryption is enabled.
- Optional PGP mode may forward plaintext when no valid key is available; required PGP mode must reject instead of downgrading.
- Downstream mailbox security remains controlled by the recipient's chosen mailbox provider and client setup.

## Unsafe Claims to Avoid

Do not describe ShieldMe as:

- Quantum-safe email provider.
- Post-quantum secure email service.
- Zero-knowledge mailbox.
- Encrypted mailbox host.
- Hosted encrypted inbox.
- Full Proton mailbox replacement.
- Full ForwardEmail mailbox replacement.
- Hosted encrypted mailbox provider.
- A service where no plaintext ever touches ShieldMe.
- A product with encrypted mailbox-at-rest architecture.
- A provider of IMAP/POP3/JMAP/webmail/mailbox storage.

## Acceptable “Not ShieldMe” Framing

Unsafe terms may appear only when explicitly framed as outside current scope, for example:

> ShieldMe is not a hosted encrypted mailbox provider and does not currently claim zero-knowledge mailbox storage or post-quantum secure email service status.

> Proton-style or ForwardEmail-style mailbox replacement work would be a future product-line decision, not part of ShieldMe's current forwarding-first model.

## Pre-Publish Review

Before publishing, verify:

- [ ] The page states ShieldMe is forwarding-first.
- [ ] The page states ShieldMe is not a hosted encrypted mailbox provider if encryption, mailbox, Proton, or ForwardEmail comparisons are discussed.
- [ ] The page distinguishes OpenPGP encrypted forwarding from encrypted mailbox hosting.
- [ ] The page says PostgreSQL mail logs are metadata-only, not that ShieldMe never handles plaintext.
- [ ] The page avoids or explicitly negates all unsafe claims listed above.
- [ ] Required PGP mode is described as reject-on-missing-key/failure, not silent plaintext fallback.
- [ ] No copy implies IMAP, POP3, JMAP, webmail, folders, drafts, hosted inboxes, or long-term message body storage.
