# ShieldMe Backup MX Queue-and-Forward Runbook

**Status:** Phase 7 implementation design and dry-run verification
**Scope:** Backup MX resilience without introducing mailbox hosting

## Architecture

ShieldMe remains forwarding-first. The backup MX is a secondary SMTP ingress that accepts mail only for valid ShieldMe domains/aliases, seals the inbound payload with authenticated encryption before persistence, and later replays the message to the primary ShieldMe ingress or the configured outbound provider after the same policy checks used by primary delivery.

### Nodes and ports

| Role | Host | Service | Port | Notes |
|---|---|---:|---:|---|
| Primary MX / ingress | primary ShieldMe VPS | `shieldme-smtp` | `2525` internally; public MX via port 25/Postfix routing | Active ingress and normal forwarding path |
| Backup MX | secondary VPS | `shieldme-backup-mx` | `25` public, or `2525` behind local MTA during staging | Queue-and-forward only |
| Primary API/worker | primary ShieldMe VPS | `alias-forwarder`, `shieldme-worker` | `4005`, BullMQ/Redis | Validates aliases, PGP policy, abuse/rate limits, forwarding |

### DNS MX plan

Production cutover should use a lower-priority primary MX and a higher-priority secondary MX:

```dns
shieldme.cc.      MX 10 mx.shieldme.cc.
shieldme.cc.      MX 50 mx2.shieldme.cc.
```

For customer domains, require the same pattern after verifying the domain in ShieldMe:

```dns
example.com.      MX 10 mx.shieldme.cc.
example.com.      MX 50 mx2.shieldme.cc.
```

Keep TTL low (300s) during rollout and testing. Do not publish the backup MX until staging failover/replay tests pass.

## Acceptance and relay policy

The backup MX must reject before queueing unless all of these are true:

1. Recipient domain is a verified, active ShieldMe domain.
2. Local part maps to an active alias on that domain.
3. Alias owner is active.
4. Recipient is verified and active.
5. Alias is not disabled/deleted.
6. Message is under the configured size limit.

Invalid domains or aliases must receive a 5xx SMTP response and must not create queue artifacts.

Replay must run the primary policy path, not a privileged bypass. The replay target is either:

- preferred: primary ShieldMe SMTP ingress (`mx.shieldme.cc`) once healthy; or
- controlled emergency: primary `handleInbound`/forwarding service with the same alias, abuse, PGP, spam, tracking, plan, and outbound checks.

### Relay authentication

Use one of these for backup-to-primary replay:

- Mutual TLS between `mx2.shieldme.cc` and `mx.shieldme.cc`, with the primary accepting replay only from the secondary certificate fingerprint; or
- A dedicated replay API endpoint protected by a rotated bearer/HMAC secret plus source IP allowlist.

Do not accept unauthenticated replay from the internet. Replay credentials must live in the secondary node root-only environment file and must never be stored inside queued payloads.

## Encrypted transient queue

Queued payloads are sealed before persistence using the existing ShieldMe AES-256-GCM envelope helper (`src/queues/secure-email-jobs.ts`). The queue record contains only encrypted ciphertext, IV, auth tag, TTL metadata, and non-sensitive operational metadata.

No plaintext `subject`, `textBody`, `htmlBody`, raw RFC822 body, or attachment bytes may be stored in Redis, disk, dead-letter queues, or logs.

### TTL, retry, and discard

Default transient payload TTL: 15 minutes (`EMAIL_QUEUE_PAYLOAD_TTL_SECONDS=900`) with hard upper bound 1 hour. Backup MX should use the same or a shorter TTL unless the owner explicitly approves a longer outage window.

Retry policy:

1. Retry replay with exponential backoff while primary ingress is unhealthy or returns transient 4xx.
2. Stop retrying when the encrypted payload expires.
3. Terminal discard removes the encrypted payload and stores only metadata: queue id, recipient domain, reason (`expired`, `invalid_alias`, `primary_rejected`, `operator_disabled`), timestamps, and retry count.
4. Terminal discard must not preserve ciphertext beyond the TTL unless the incident commander explicitly snapshots the queue for forensics; snapshots must be encrypted at rest and time-boxed.

## Explicit non-goals

The backup MX must not expose or implement IMAP, POP3, JMAP, webmail, user mailbox login, drafts, folders, searchable message storage, mailbox indexes, user-visible inboxes, hosted mailbox storage, plaintext body persistence, or a fallback path that sends plaintext for aliases with PGP required.

## PGP no-plaintext guarantee

Replay must preserve ShieldMe PGP policy:

- `pgpMode=required`: if a valid recipient public key is missing or encryption fails, replay rejects/drops per policy and never sends plaintext.
- `pgpMode=optional`: encrypt when a valid key exists; otherwise follow normal optional-mode behavior.
- Backup queue encryption is transport/storage protection only; it is not a replacement for recipient OpenPGP encryption.

## Observability

Expose and alert on backup MX accepted/rejected counts by reason, encrypted queue depth, oldest queued age, replay attempts/successes/failures/discards, stale cleanup count, primary ingress health from secondary node, and invalid-domain/invalid-alias rejection spikes.

Initial implementation can use structured PM2 logs and the dry-run verifier below; production should add Prometheus counters/gauges once the secondary node exists.

## Operational setup

1. Provision secondary VPS in a different provider/region from primary.
2. Apply baseline hardening: UFW allow 22/25/80/443 only as needed, fail2ban/CrowdSec, key-only SSH, automatic security updates, non-root service user.
3. Install the ShieldMe backup MX service code from the same release as primary.
4. Configure `DATABASE_URL` or validation endpoint access, local encrypted queue/Redis, `QUEUE_ENCRYPTION_SECRET`, replay target/auth, and `EMAIL_QUEUE_PAYLOAD_TTL_SECONDS=900`.
5. Start `shieldme-backup-mx` under systemd/PM2 as a non-root user. If binding directly to port 25, use `setcap cap_net_bind_service=+ep $(command -v node)` or a local MTA/HAProxy port forward rather than running Node as root.
6. Run dry-run verification before DNS changes.
7. Publish `mx2.shieldme.cc` A/AAAA and MX priority 50 only after tests pass.

## Failover test plan

1. Confirm primary services are healthy (`alias-forwarder`, `shieldme-smtp`, `shieldme-worker`).
2. Run `node dist/scripts/backup-mx-dry-run.js` in production build output. This validates accepted/rejected recipient behavior and encrypted TTL cleanup without sending real email.
3. In staging, stop or firewall the primary MX target.
4. Send a test message to a valid alias through backup MX; confirm encrypted queue depth increments and no plaintext appears in Redis/disk logs.
5. Send to an invalid domain/alias; confirm 5xx reject and no queue artifact.
6. Restore primary MX target; confirm replay succeeds and queue depth returns to zero.
7. Test a PGP-required alias with missing/invalid key; confirm no plaintext delivery.

## Rollback and emergency operations

### DNS rollback

Remove or de-prioritize the secondary MX:

```dns
shieldme.cc. MX 10 mx.shieldme.cc.
# remove mx2.shieldme.cc or raise to MX 90 while investigating
```

### Disable intake

```bash
systemctl stop shieldme-backup-mx
# or
pm2 stop shieldme-backup-mx
```

### Emergency drain

1. Disable new intake.
2. Keep replay worker enabled if primary is healthy.
3. Monitor queue depth until zero.
4. If payloads expire before replay, run terminal cleanup and document discard counts.

### Emergency discard

Only when instructed by the incident commander: stop intake and replay, snapshot encrypted metadata only if needed, delete encrypted payload keys/queue entries, and record discard count/reasons without dumping payloads.

## Maintenance window

DNS publication of the backup MX does not require primary downtime, but use a low-traffic maintenance window for the first production failover simulation because remote senders can start using the secondary MX if the primary is unreachable.

## Current implementation evidence

Primary ShieldMe already has encrypted BullMQ payloads for forwarding jobs (`src/queues/secure-email-jobs.ts`, `src/queues/email-jobs.ts`) and drops expired/undecryptable jobs in the worker before delivery (`src/workers/forwarding.worker.ts`). The Phase 7 dry-run script verifies the same core guarantees without creating mailbox storage.
