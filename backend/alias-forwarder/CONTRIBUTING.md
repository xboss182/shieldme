# Contributing and Change Management

All ShieldMe/alias-forwarder changes must be tied to a Multica issue or equivalent change record.

## Pull/change requirements
- Describe scope, risk, rollout, and rollback.
- Run backend `npm run typecheck`, `npm test`, `npm run build` before deploy.
- Run frontend build when `/var/www/shieldme` changes.
- Security-sensitive changes require explicit verification evidence in the issue comment.

## Approval rules
- Normal changes: one reviewer/operator approval before production where practical.
- Emergency fixes: may deploy immediately for containment/restoration, then document and review within 1 business day.

## Deployment checklist
Use `docs/policies/DEPLOY-CHECKLIST.md` for every production deployment.

## Rollback
Use `docs/policies/ROLLBACK-PROCEDURE.md` and record verification evidence after rollback.
