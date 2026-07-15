# Owner Decision Checklist — SOC 2 Type I Engagement

**Last Updated**: 2026-07-09
**System**: ShieldMe / alias-forwarder
**Purpose**: Human-owner decisions needed before sending the external SOC 2 Type I readiness / pen-test packet to an auditor or compliance partner.

## Send-Ready Packet

Primary packet to share or adapt externally:

- `/root/alias-forwarder/docs/compliance/auditor-handoff-packet.md`
- `/root/alias-forwarder/docs/compliance/soc2-type-i-control-summary.md`
- `/root/alias-forwarder/docs/compliance/external-auditor-questionnaire.md`

## Decisions Before Auditor Kickoff

| Decision | Owner Choice Needed | Recommended Default |
|---|---|---|
| Compliance partner | Select auditor, readiness consultant, or compliance platform | Start with readiness review + external pen test before formal Type I opinion |
| Audit scope | ShieldMe only vs. broader VPS/workspace | ShieldMe only for first Type I scope |
| Trust Services Criteria | Which SOC 2 criteria to include | Security, Availability, Confidentiality |
| Engagement type | Pen test, readiness review, formal Type I, or staged sequence | Readiness review + pen test, then Type I |
| Type I review date | Point-in-time audit date/window | After Stage 18 non-root hardening completes or is explicitly accepted as exception |
| Known exceptions | Accept or remediate remaining exceptions before auditor review | Prefer remediating PM2 non-root hardening in Stage 18; document Redis/network compensating controls |
| Evidence repository | Where evidence will live during audit | `/root/alias-forwarder/docs/evidence/` plus auditor portal if provided |
| Control owners | Named humans for recurring reviews and incident response | Assign one primary owner and one backup before Type II period |
| Type II intent | Whether to pursue Type II after Type I | Yes, if enterprise/customer assurance is the goal |
| Type II evidence period | 3, 6, or 12 months | 3–6 months after Type I readiness is accepted |

## Human Control Owner Assignments

Fill these before Type II evidence collection starts:

- Access review owner: `TBD`
- Vendor review owner: `TBD`
- Backup/restore verification owner: `TBD`
- Incident response owner: `TBD`
- Change/deployment approval owner: `TBD`
- Risk register owner: `TBD`

## External Kickoff Questions to Ask

1. Is the proposed ShieldMe-only scope acceptable for a first SOC 2 Type I?
2. Do the auditor/compliance partner's expectations require PM2 non-root hardening before formal Type I testing?
3. Are Redis network compensating controls acceptable, or should service-level bind/protected-mode changes be required before testing?
4. Which evidence artifacts should be uploaded to the auditor portal vs. kept as internal support?
5. What recurring evidence cadence should be started now for Type II?
6. Does the auditor require formal board/management approval of policies before Type I?
7. Does the external pen test need to include SMTP/mail pipeline testing, or only app/API testing?

## Type I vs. Type II Reminder

- **Type I**: point-in-time control design and implementation. Current packet supports this readiness/audit step.
- **Type II**: operating effectiveness over time. This requires recurring evidence collection and control operation for the selected evidence period.

## Recommended Next Action

After Stage 18 completes or is explicitly accepted as a known exception, send the handoff packet to 2–3 SOC 2 providers/auditors and request a Type I readiness review proposal with optional external penetration test scope.
