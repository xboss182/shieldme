# Data Retention Policy

## Data categories
- Account data: email, password hash, role, status, login/lockout metadata.
- Domain/alias/recipient metadata: configuration needed to route mail.
- Mail metadata: envelope sender/recipient, delivery status, size, external IDs; message bodies are not intentionally persisted.
- Audit/security logs: administrative actions, security events, abuse controls.
- PGP keys: public keys and fingerprints only.

## Retention
- Audit/security logs: minimum 1 year.
- Mail delivery metadata: 1 year unless legal/security needs require longer.
- Disabled/deleted aliases/domains: retain metadata for 90 days for abuse investigation, then eligible for deletion.
- Backups: retain 30 days by default unless a legal hold applies.

## Deletion
Users may request deletion of account-controlled domains/aliases/recipients. Operators verify no active incident/legal hold before deletion. Backups naturally expire through retention pruning.
