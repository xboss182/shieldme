# Deploy Checklist

## Pre-deploy
- [ ] Change is linked to a Multica issue or approved change record.
- [ ] Correct production directory confirmed with `pm2 describe <service>`.
- [ ] Secrets and raw email content are not included in commits/docs/logs.
- [ ] For MailBaby, DKIM signing credentials are injected. Keep `MAILBABY_DSN_VERIFIED=false` until documented, authenticated DSN provenance is independently verified; this gate never enables automatic MailBaby suppression.
- [ ] Database migration, if any, has rollback or restore notes.
- [ ] Backend checks passed when applicable: `npm run typecheck`, `npm test`, `npm run build`, `npm audit --omit=dev --audit-level=high`.
- [ ] Frontend build passed when `/var/www/shieldme` changes.

## Deploy
- [ ] Changes applied to the confirmed deployment directory.
- [ ] Build output timestamp captured (`stat -c %Y dist/` or equivalent).
- [ ] PM2 service restarted with updated env.
- [ ] PM2 state saved with `pm2 save`.

## Post-deploy
- [ ] PM2 status and `cwd` verified.
- [ ] Recent PM2 logs reviewed.
- [ ] Health endpoint / frontend page checked.
- [ ] A user-facing workflow smoke test passed.
- [ ] md5/hash proof captured for changed source files when required.
- [ ] Rollback reference documented.
