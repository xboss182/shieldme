# Risk Register

| Risk | Likelihood | Impact | Current controls | Residual risk | Mitigation plan |
|---|---:|---:|---|---|---|
| Account compromise | Medium | High | Strong passwords, lockout, JWT sessions | Medium | Add MFA/admin SSO in future |
| Admin key compromise | Low | High | Per-operator admin accounts, deprecated ADMIN_SECRET | Medium | Remove ADMIN_SECRET after migration |
| Mail abuse/spam | Medium | High | rate limits, suppression/blocklist, kill-switch | Medium | Add automated anomaly alerts |
| Data breach | Low | High | hashed passwords, no body persistence, TLS, audit logs | Medium | External pen test Stage 16 |
| Resend outage | Medium | Medium | delivery logging, retry worker | Medium | Define alternate provider runbook |
| Cloudflare/DNS outage | Low | High | DNS/CDN managed by Cloudflare | Medium | Export DNS config quarterly |
| VPS outage | Medium | High | pg_dump backups, PM2 restart | Medium | Add warm standby target |
| Redis data loss | Medium | Medium | RDB/AOF persistence checked | Low | Change maxmemory policy to noeviction |
| Backup failure | Low | High | backup + restore scripts | Medium | Schedule and alert on backup age |
| Dependency vulnerability | Medium | High | production npm audit in build | Low | Monthly full dev audit review |
| Insider/operator error | Medium | High | change checklist, audit logs, access reviews | Medium | Require PR review before major changes |
| Webhook forgery | Low | Medium | Resend/Svix signature validation | Low | Rotate webhook secrets semi-annually |
| PGP key misuse/expiry | Medium | Medium | public-key validation, fingerprinting | Low | Expiry review in access evidence |
| DDoS/brute force | Medium | Medium | Cloudflare, API/auth rate limits | Medium | Add alert thresholds |
| Secret leakage in logs | Low | High | pino redaction, sanitized startup errors | Low | Periodic log sampling |
