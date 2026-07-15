# Rollback Procedure

1. Identify last known-good source/config and changed files.
2. Revert code/config or restore previous artifact.
3. If database migration is involved, apply tested down/compensating migration only if safe.
4. Rebuild backend/frontend in deployment directories.
5. Restart PM2 services and save process list.
6. Verify `/api/health`, app load, SMTP/worker status, and logs.
7. Document incident/change record and follow-up fix.

## ShieldMe non-root PM2 rollback

Use only if the dedicated `shieldme` runtime prevents service recovery.

1. Stop the non-root runtime: `systemctl stop pm2-shieldme.service`.
2. Restore the Stage 18 backup snapshot from `/root/shieldme-hardening-backups/<timestamp>/` if source ownership/path changes need reversal.
3. Recreate previous root PM2 processes from the backed-up PM2 process list or with the previous script paths:
   - `/root/alias-forwarder/dist/index.js`
   - `/root/alias-forwarder/dist/smtp/smtp.server.js`
   - `/root/alias-forwarder/dist/workers/forwarding.worker.js`
   - `/var/www/shieldme/prod-server.mjs`
4. Run `pm2 save` for the root PM2 daemon only after verifying the restored services.
5. Verify `https://api.shieldme.cc/api/health`, `https://app.shieldme.cc`, SMTP listener on `:2525`, and forwarding worker logs.
