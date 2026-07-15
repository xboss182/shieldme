# Change Management Policy

## Standard changes
- Changes must be tracked in Multica or an equivalent issue.
- Code changes require typecheck/tests/build before deployment.
- Production deployments must record PM2 cwd/script, build timestamp, restart/save, logs, md5/hash evidence for changed source, and functional verification.

## Emergency changes
Emergency changes may be deployed before full review when needed to restore service or contain a security incident. The operator must document the reason, commands run, verification, and follow-up review within 1 business day.

## Rollback
Rollback by reverting the code/config change, rebuilding, restarting PM2 services, and verifying health. See `docs/policies/ROLLBACK-PROCEDURE.md`.
