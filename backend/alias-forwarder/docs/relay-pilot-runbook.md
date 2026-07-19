# Guarded BYO SMTP Pilot Runbook

## Scope and approval gate

This runbook prepares, but does not authorize, a relay pilot. Keep `BYO_SMTP_ENABLED=false`, `byoSmtpEnabled=false`, the pilot owner list empty, and `shieldme_relay_security_apply=false` until a named owner separately authorizes a disposable-provider pilot. Never use customer tenants, destinations, credentials, or data.

## Root of trust and custody

- PostgreSQL stores only ciphertext, AES-GCM metadata, a wrapped DEK, and a KEK identifier in `smtp_relay_credentials` and `domain_signing_keys`.
- The active 32-byte KEK is a root-owned, mode `0600` base64 file at `/var/lib/shieldme-relay-kms/vN.key`; it is never placed in PostgreSQL, PM2 environment, the repository, or application logs.
- `shieldme-relay-kms.service` is the only process that reads KEKs. It exposes a `root:shieldme`, mode `0660` Unix socket. The unprivileged `shieldme` API, SMTP, and worker processes can request authenticated DEK wrap/unwrap with record-bound AAD but cannot read a KEK.
- Back up every active and retired KEK to the separately approved encrypted/off-host secret custody system. Retire a KEK only after a restore proof and `npm run relay:kek:rotate -- --apply` successfully rewrap all affected rows. Keep the prior key until the retention window and restore test pass.
- Loss of every copy of a referenced KEK is unrecoverable by design. Immediately disable BYO SMTP, preserve ciphertext for incident analysis, revoke affected relay credentials with customers, and provision/test a new relay. Do not attempt plaintext recovery or fall back to V1.

## Additive database procedure

1. Confirm the actual PM2 working directory and source revision; deploy only merged `main` after review.
2. Keep the environment flag false and persist the runtime BYO switch off:
   ```bash
   curl --fail-with-body -X POST https://api.shieldme.cc/api/admin/byo-smtp/disable -H "Authorization: Bearer $ADMIN_TOKEN"
   ```
3. Capture schema reality and a verified backup:
   ```bash
   psql "$DATABASE_URL" -c "SELECT to_regclass('public.aliases'), to_regclass('public.domains'), to_regclass('public.mail_logs');"
   ./scripts/backup-db.sh
   RESTORE_TEST_DATABASE_URL="$DISPOSABLE_RESTORE_DATABASE_URL" RUN_RESTORE=true ./scripts/verify-restore.sh "$BACKUP"
   ```
4. Confirm the backup contains `smtp_relay_credentials` and `domain_signing_keys` after a disposable dry run, then confirm the separately escrowed active and retired KEKs are available to the restore operator.
5. Apply the locked, flag-guarded additive migration only with BYO explicitly false:
   ```bash
   PGOPTIONS='-c app.byo_smtp_enabled=false' psql --set=ON_ERROR_STOP=1 "$DATABASE_URL" -f drizzle/0005_cold_amazoness.sql
   ```
6. Verify no legacy alias changed route:
   ```bash
   psql "$DATABASE_URL" -c "SELECT outbound_mode, count(*) FROM aliases GROUP BY 1;"
   psql "$DATABASE_URL" -c "SELECT count(*) FROM aliases WHERE outbound_mode <> 'platform' OR smtp_relay_id IS NOT NULL;"
   ```

The migration is transactional, advisory-locked, checks the BYO flag, adds tables/columns/constraints only, and does not alter existing aliases from `platform`.

## Controlled infrastructure activation

1. Provide an active KEK externally as `/var/lib/shieldme-relay-kms/vN.key`, root-owned and `0600`.
2. Populate only a disposable pilot UUID and approved public provider hostname(s) in protected Ansible inventory; do not put credentials in inventory or git.
3. Set `shieldme_relay_security_apply=true`; keep `BYO_SMTP_ENABLED=false` for the initial configuration deployment.
4. Run `ansible-playbook -i ansible/inventory/production.yml ansible/site.yml --tags relay --check` then a reviewed non-check application.
5. Verify:
   ```bash
   systemctl is-active shieldme-relay-kms shieldme-relay-egress.timer
   nft list table inet shieldme_relay_egress
   curl --fail http://127.0.0.1:9405/metrics
   ```
6. The nftables policy applies only to the `shieldme` UID and SMTP destination ports 465/587. It permits the refreshed approved-host public IP sets and rejects every other destination, including loopback, link-local/metadata, private, CGNAT, multicast, documentation/reserved space, and IPv4-mapped IPv6.
7. Before pilot enablement, run the allowed-host and blocked-destination probes using `./scripts/verify-relay-egress.sh`. An allowed probe may succeed, time out, or be provider-refused; it must not be locally `EPERM`/administratively prohibited. Every blocked probe must be locally denied.

## Pilot enablement and monitoring

After explicit authorization only:

1. Set the environment feature flag true, the single disposable owner UUID, and one approved disposable-provider hostname; restart API, SMTP, and worker.
2. Enable the runtime switch through the authenticated admin endpoint. It refuses activation without the feature flag, KMS socket, and pilot owner list.
3. Create one relay on the approved hostname. The API rejects any unapproved hostname; the resolver and pinned socket separately reject private/reserved DNS answers.
4. Use only a disposable verified destination and confirm the signed relay test token. Pilot limits are 25 delivered relay messages/month/tenant and one concurrent relay send unless separately reviewed.
5. Watch `shieldme_smtp_relay_*` plus `shieldme_delivery_events_total`: test failures, TLS/auth/SSRF/signing/secret-decrypt failures, retries, queue age/depth, circuit openings, submissions, and provider DSN/bounce/complaint events. Alert rules are staged at `/etc/prometheus/rules/shieldme-relay.yml`.

## Suspension and rollback

- Suspend an individual relay via `POST /api/admin/smtp-relays/:id/suspend`; suspend a tenant with the existing user disable control.
- Global kill switch: `POST /api/admin/byo-smtp/disable`, then set `BYO_SMTP_ENABLED=false` and restart only the API/SMTP/worker processes after confirming their PM2 CWD.
- Do not reassign queued `custom_smtp` rows to `platform`. The worker treats BYO-unavailable custom jobs as failed, preserving their custom route and never sends them through V1.
- Verify rollback with:
  ```bash
  psql "$DATABASE_URL" -c "SELECT outbound_route_mode, status, count(*) FROM mail_logs WHERE outbound_route_mode = 'custom_smtp' GROUP BY 1,2;"
  psql "$DATABASE_URL" -c "SELECT count(*) FROM mail_logs WHERE outbound_route_mode = 'custom_smtp' AND outbound_provider IN ('resend','ses');"
  ```
  The second query must be zero. Verify V1 health independently through its existing API and forwarding smoke test.

## Restore proof

1. Restore the database backup into a disposable isolated database.
2. Restore the active and referenced retired KEKs to an isolated root-only key directory from the approved escrow path; do not copy keys into the database or runtime environment.
3. Start isolated KMS and app processes against the disposable database and run `npm run relay:restore:verify -- --verify`.
4. The verifier decrypts one stored relay credential and one domain signing key without printing either secret. Record only counts, key IDs, hashes of backup artifacts, and command exit status.
