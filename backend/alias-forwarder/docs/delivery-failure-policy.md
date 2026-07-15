# Delivery Failure and Retry Policy

ShieldMail records delivery failures as metadata only. The delivery failure log may contain alias address, recipient address, provider, provider message id, reason, and short diagnostic text. It must not contain raw message bodies, full MIME content, or decrypted email payloads.

## Failure log

- Bounce, complaint, and provider failed events are normalized into `delivery_failure_log`.
- The existing mail log remains the operational delivery history.
- Per-alias and admin APIs expose failure counts and recent failure metadata for troubleshooting.

## Retry policy

Outbound forwarding jobs use BullMQ with:

- `attempts: 3`
- exponential backoff
- base delay: `30000` ms

Retries operate on encrypted job metadata/payload references only. Dead-letter or failed job inspection must not persist raw email bodies.

## Suppression visibility

Bounce and complaint webhooks may suppress affected aliases/recipients according to abuse-handling rules. Suppression state should be visible through admin delivery failure summaries and user-facing failed-delivery views without exposing message body content.
