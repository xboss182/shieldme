# ShieldMe Forwarding-First Infrastructure and Delivery Runbook

**Scope:** outbound delivery/authentication hardening, infrastructure safeguards, and backup MX design while preserving ShieldMe as a forwarding-only product.

## Outbound delivery policy

- Primary provider is selected by `OUTBOUND_PROVIDER` (`resend` or `ses`).
- Optional fallback is selected by `OUTBOUND_FALLBACK_PROVIDER` (`none`, `resend`, or `ses`). Default: `none`.
- Fallback is attempted only after the primary provider throws and the fallback provider is configured.
- For aliases with `pgpMode = required`, fallback is allowed only when the message body has already been OpenPGP-encrypted in memory (`pgpEncrypted=true`). A PGP-required message that cannot be encrypted must remain rejected; never send plaintext through either provider.
- Optional PGP mode may fall back to plaintext only if encryption was not required by the alias policy.

### Local DKIM / SRS decision

- Current provider DKIM (Resend/SES domain authentication) remains the safest default for ShieldMe-controlled outbound domains.
- Local DKIM signing should be added only if ShieldMe starts sending through a raw SMTP relay/MTA that does not already sign with aligned DKIM. Store private keys outside git and rotate selector-based keys.
- SRS rewriting should be implemented at the SMTP/MTA layer only when ShieldMe forwards with the original envelope sender and recipient systems show SPF/DMARC failures. The current app-level provider send path uses ShieldMe-controlled `forwarded+...@shieldme.cc` sender identity and does not require SRS in application code.

## DMARC alignment monitoring

Start with report-only DMARC monitoring before stricter enforcement:

```text
_dmarc.shieldme.cc TXT "v=DMARC1; p=none; rua=mailto:dmarc@shieldme.cc; adkim=s; aspf=s; fo=1"
```

After 2-4 weeks of clean aggregate reports, move to `p=quarantine`, then `p=reject` only if both provider DKIM and SPF alignment remain healthy. Do not route DMARC reports to a mailbox product inside ShieldMe; use an external/report mailbox or processor.

## Infrastructure safeguards

- Apply the Ansible baseline in `ansible/` with `--check --diff` first.
- The baseline manages UFW/fail2ban/SSH hardening, Caddy TLS/security headers, ShieldMe service user, and PM2 ecosystem safeguards.
- PM2 processes should use restart caps (`max_restarts`), delay (`restart_delay`), memory ceiling (`max_memory_restart`), and graceful kill timeout (`kill_timeout`).
- Secrets stay in runtime `.env` or Ansible Vault; generated `.env.ansible.example` remains placeholders only.

## Backup MX design — queue-and-forward only

Backup MX is **not implemented in this code change**; use this design before provisioning DNS:

1. Secondary VPS accepts SMTP only for verified ShieldMe recipient domains/aliases.
2. It stores encrypted transient queue payloads only, using an encryption key outside queue storage.
3. Queue TTL: discard undelivered encrypted payloads after a defined retention window (recommended 3-7 days); no searchable index, IMAP/POP3/JMAP, webmail, or user mailbox storage.
4. Replay path relays to the primary ShieldMe SMTP/API or the configured outbound provider only after the same alias, recipient, PGP, suppression, and abuse policy checks pass.
5. MX DNS should prefer primary and use lower-priority secondary, e.g. `10 mail.shieldme.cc`, `20 mx2.shieldme.cc`.
6. Operational tests must verify failover, replay, TTL expiry, and that no plaintext bodies are stored on disk/PostgreSQL.

## Verification commands

```bash
npm run test -- --run src/modules/inbound/outbound.test.ts
npm run build
ansible-playbook --syntax-check -i ansible/inventory/production.yml ansible/site.yml
```
