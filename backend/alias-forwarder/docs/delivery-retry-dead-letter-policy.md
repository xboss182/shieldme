# Delivery Retry and Dead-Letter Policy

This service forwards alias email without storing message bodies in durable application tables.

## Queue Payload Storage

Forwarding jobs can temporarily contain message bodies while they wait in BullMQ. To prevent plaintext body storage:

- Every `EmailForwardingPayload` is sealed with AES-256-GCM before BullMQ writes it to Redis.
- BullMQ job data contains only: `encrypted`, `iv`, `tag`, `ciphertext`, and TTL metadata.
- Plaintext fields such as `textBody`, `htmlBody`, `subject`, and raw MIME content are never stored directly in the job record.
- Payloads expire via `EMAIL_QUEUE_PAYLOAD_TTL_SECONDS` (default: 900 seconds / 15 minutes).
- Expired or undecryptable payloads are dropped by the worker and not delivered.

## Retry Policy

Default queue settings are defined in `src/queues/email-jobs.ts`:

- `attempts`: 3 total attempts.
- `backoff`: exponential, starting at 30 seconds.
- `removeOnComplete`: remove completed jobs after the payload TTL window.
- `removeOnFail`: remove failed/dead-lettered jobs after the payload TTL window.

Transient outbound send failures are retried by rethrowing from the worker. Permanent failures (invalid recipient, suppressed address, blocklist, bounce/complaint/permanent provider error, or 5xx permanent response) are recorded as failed metadata and are not retried.

## Dead-Letter Guarantee

Dead-lettered BullMQ jobs retain only encrypted ciphertext and TTL metadata while Redis keeps the failed job. They do **not** retain plaintext body material. Tests assert the serialized job record does not include plaintext body/HTML/subject values.

## Webhook Failure Metadata

Delivery provider webhooks (Resend and SES) are normalized into this internal vocabulary:

- `delivered`
- `failed`
- `bounced`
- `complained`

Failure metadata is recorded in `delivery_failure_log` with only:

- alias id / alias address
- recipient
- provider
- provider message id
- reason (`bounce`, `complaint`, `failed`)
- short diagnostic string (max 500 chars)
- timestamp

No message bodies, raw MIME, attachments, or content snippets are stored in delivery failure logs.
