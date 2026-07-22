# ShieldMe Forwarding-First Infrastructure and Delivery Runbook

**Scope:** outbound delivery/authentication hardening, infrastructure safeguards, and backup MX design while preserving ShieldMe as a forwarding-only product.

## Outbound delivery policy

- Primary provider is selected by `OUTBOUND_PROVIDER` (`mailbaby` or `resend`). Jobs pin that provider at enqueue time; there is no implicit fallback.
- MailBaby uses SMTP on `relay.mailbaby.net:2525` with certificate-verified STARTTLS and SMTP credentials. `/mail/rawsend` is not used because its custom-envelope semantics have not been independently proven; retain this as a vendor gate before any transport change.
- MailBaby receives a rewritten RFC 822 message: the original MIME body and attachments are retained, while `From`, `Reply-To`, loop-prevention, and forwarding headers are rebuilt. Original DKIM signatures cannot survive that rewrite and are removed; MailBaby DKIM-signs the final message with ShieldMe's verified-domain key.
- MailBaby forwarding uses an explicit `b+<token>@sm-bounces.<platform-domain>` envelope sender. Only its hash is persisted for 30 days; an inbound DSN resolves it to metadata, marks the delivery bounced, and suppresses the destination.
- For aliases with `pgpMode = required`, a message that cannot be encrypted remains rejected; plaintext fallback is never allowed.

### DKIM / bounce-domain decision

- MailBaby's SMTP adapter signs final rewritten messages with ShieldMe's configured DKIM domain, selector, and private key. Keep the private key in runtime secrets or Ansible Vault and rotate selector-based keys.
- The explicit ShieldMe bounce-domain envelope is the current SRS-equivalent correlation contract. Do not forward with the original envelope sender unless an SMTP/MTA-layer SRS implementation and live DMARC evidence are approved.

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
