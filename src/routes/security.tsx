import { createFileRoute, Link } from "@tanstack/react-router";
import { Shield, Lock, Database, AlertTriangle, Mail, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Security — ShieldMail" },
      {
        name: "description",
        content:
          "ShieldMail security model, controls, vulnerability disclosure, backups, and incident response posture.",
      },
    ],
  }),
  component: SecurityPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card-grad p-6 shadow-card">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">{children}</div>
    </section>
  );
}

function SecurityPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Link to="/" className="text-sm text-accent hover:underline">
          ← Back to ShieldMail
        </Link>
        <div className="mt-8 rounded-3xl border border-border bg-hero p-8">
          <div className="flex items-center gap-3 text-accent">
            <Shield className="h-6 w-6" />
            <span className="text-sm font-semibold uppercase tracking-[0.2em]">Trust Center</span>
          </div>
          <h1 className="mt-4 text-4xl font-bold md:text-5xl">
            Security and vulnerability disclosure
          </h1>
          <p className="mt-4 text-muted-foreground">
            ShieldMail is a secure alias-forwarding service. We do not claim to be a hosted mailbox,
            zero-knowledge mailbox, or SOC 2 certified provider today.
          </p>
        </div>
        <div className="mt-8 grid gap-5">
          <Section title="Security model">
            <p>
              Inbound mail is accepted for verified aliases, metadata is logged for delivery and
              abuse controls, and message content is forwarded rather than stored as a mailbox.
              Optional OpenPGP recipient encryption can encrypt forwarded content for configured
              recipients.
            </p>
          </Section>
          <Section title="Current controls">
            <p>
              <Lock className="mr-2 inline h-4 w-4 text-accent" />
              TLS via Caddy, HSTS, CSP, frame protection, rate limiting, JWT auth, non-root PM2
              services, admin kill-switch, sender blocklists, suppression handling, and audit logs
              for sensitive admin actions.
            </p>
          </Section>
          <Section title="Backups and recovery">
            <p>
              <Database className="mr-2 inline h-4 w-4 text-accent" />
              Operational data is backed up on the ShieldMe infrastructure. Restore evidence and
              retention practices are tracked internally as part of SOC 2 Type I readiness.
            </p>
          </Section>
          <Section title="Incident response">
            <p>
              <AlertTriangle className="mr-2 inline h-4 w-4 text-accent" />
              Security events are triaged by severity. Confirmed incidents are contained,
              investigated, remediated, and communicated to affected users when impact is confirmed.
            </p>
          </Section>
          <Section title="Report a vulnerability">
            <p>
              <Mail className="mr-2 inline h-4 w-4 text-accent" />
              Send reports to{" "}
              <a className="text-accent underline" href="mailto:security@shieldme.cc">
                security@shieldme.cc
              </a>
              . Include affected URLs, steps to reproduce, impact, and a safe proof of concept.
              Please do not access, modify, or exfiltrate other users' data.
            </p>
          </Section>
          <Section title="SOC 2 readiness status">
            <p>
              <RotateCcw className="mr-2 inline h-4 w-4 text-accent" />
              ShieldMail maintains internal SOC 2 readiness evidence and policies. External
              certification is pending; ShieldMail should not be represented as SOC 2 certified
              until an auditor report is complete.
            </p>
          </Section>
        </div>
      </div>
    </main>
  );
}
