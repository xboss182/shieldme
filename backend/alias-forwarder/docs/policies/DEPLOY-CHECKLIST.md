# Deploy Checklist

## Pre-deploy
- Identify issue/stage and exact paths changed.
- Run `npm run typecheck`, `npm test`, `npm run build`.
- Run production audit gate: `npm audit --omit=dev --audit-level=high`.
- Confirm migration/backward compatibility if DB schema changed.

## Deploy
- Confirm PM2 cwd with `pm2 describe <service>`.
- Build in deployment directory and capture `stat -c %Y dist/`.
- Restart services with `pm2 restart ... --update-env && pm2 save`.

## Post-deploy
- Check PM2 status and recent logs.
- Verify health endpoint and critical user/admin workflow.
- Capture security headers for public endpoints.
- Record md5/sha256 for changed source files when source changed.
