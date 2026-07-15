# ShieldMe TTI Forwarding Latency Monitoring

## Scope

TTI monitoring is an internal ops-only synthetic check for measuring inbound-to-forwarded delivery latency. It is not a mailbox feature and must not be exposed as IMAP, POP3, JMAP, webmail, or user message storage.

## Data model

`tti_checks` stores metadata only:

- `probe_token`
- `alias_address`
- `provider`
- `synthetic_inbox`
- `external_message_id`
- `provider_message_id`
- `status`
- `sent_at`
- `received_at`
- `latency_ms`
- `failure_reason`
- timestamps

It intentionally has no body, html, text, subject, attachment, raw message, or mailbox-content columns.

## Synthetic setup

1. Create a dedicated synthetic ShieldMe alias, for example `tti-monitor@shieldme.cc`.
2. Forward it to a dedicated synthetic monitoring inbox owned by ops, not a user mailbox product.
3. Generate a random probe token per check.
4. Send a test email to the alias with a subject marker: `[shieldme-tti:<probe_token>]`.
5. Create the metadata probe via `POST /api/admin/tti/probes`.
6. When the forwarding worker forwards the matching synthetic email, it marks the probe `forwarded` and records `latency_ms`.
7. If the probe times out, mark it failed via `POST /api/admin/tti/probes/:probeToken/fail`.

## Ops API

All endpoints live under `/api/admin/tti` and require the existing admin auth guard:

- `GET /api/admin/tti?limit=50` — recent metadata-only checks.
- `POST /api/admin/tti/probes` — create a pending synthetic probe.
- `POST /api/admin/tti/probes/:probeToken/fail` — record timeout/provider failure metadata.

## Environment

No user-mailbox env vars are required. Optional external cron/checker configuration should include only synthetic monitoring values:

- Synthetic alias address.
- Synthetic monitoring inbox label/address.
- Probe interval and timeout.
- SMTP sender credentials for the synthetic test sender, if the checker sends mail directly.

Do not configure IMAP/POP3/JMAP access for ShieldMe users. If an external checker polls the synthetic monitoring inbox, keep it outside the product surface and use it only to validate end-to-end receipt for the dedicated synthetic inbox.
