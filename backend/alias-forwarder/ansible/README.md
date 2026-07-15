# ShieldMe Ansible baseline

Safe, ShieldMe-owned Ansible playbooks for the current ShieldMe deployment on the primary VPS (`152.42.211.146`). These files are tailored to ShieldMe's actual Caddy + PM2 + Node.js stack.

## Scope

- Base Ubuntu hardening: UFW, fail2ban, unattended upgrades, conservative sysctl settings.
- Runtime dependencies: Node.js, corepack, PM2, Caddy, Redis/PostgreSQL client tools.
- ShieldMe app bootstrap: non-root `shieldme` user, deploy directories, example env, PM2 ecosystem template for API/SMTP/worker/site.
- Caddy: Caddy-only site blocks for `shieldme.cc`, `www.shieldme.cc`, `app.shieldme.cc`, `api.shieldme.cc`, and `mta-sts.shieldme.cc`.
- Mail security documentation: SPF, DKIM, DMARC, MTA-STS, TLS-RPT, CAA references. DNS is not changed by these playbooks.

## Safety notes

This is an initial IaC baseline, not an irreversible migration. Review generated config before enabling it in production. Secrets are placeholders only; store real values in Ansible Vault or existing runtime `.env` files outside git.

Risky controls such as swap/core-dump changes are disabled by default and require opt-in vars. PostgreSQL data is not initialized, dropped, or migrated by these playbooks.

## First run

```bash
cd /root/alias-forwarder/ansible
ansible-galaxy collection install -r requirements.yml
ansible-playbook -i inventory/production.yml site.yml --check --diff
```

Targeted runs:

```bash
ansible-playbook -i inventory/production.yml site.yml --tags base --check --diff
ansible-playbook -i inventory/production.yml site.yml --tags caddy --check --diff
ansible-playbook -i inventory/production.yml site.yml --tags app --check --diff
```

Syntax check:

```bash
ansible-playbook --syntax-check -i inventory/production.yml site.yml
```

## Rollback guidance

- Keep a backup of `/etc/caddy/Caddyfile`, `/etc/caddy/conf.d/`, and PM2 process config before first apply.
- If Caddy reload fails, inspect `caddy validate --config /etc/caddy/Caddyfile` and restore the prior Caddyfile/snippet.
- PM2 handlers restart only named processes; failed restarts are non-fatal so this baseline cannot accidentally fail because a process has not been created yet.
- Remove or revert `/etc/caddy/conf.d/shieldme.caddy` to back out the Caddy role.
