import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy and data handling — ShieldMail" },
      {
        name: "description",
        content: "What ShieldMail stores, forwards, logs, retains, and deletes.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const rows = [
    ["Account data", "Email, password hash, role, login/security timestamps, and active status."],
    [
      "Alias metadata",
      "Domains, aliases, recipient addresses, verification state, PGP key metadata, and alias status.",
    ],
    [
      "Forwarded messages",
      "Message content is processed to forward mail. ShieldMail does not provide hosted mailbox storage in the current product.",
    ],
    [
      "Mail logs",
      "Envelope sender/recipient, destination, status, size, external message id, PGP mode, and mail-auth signals. Logs avoid message body content.",
    ],
    [
      "Security logs",
      "Audit records, rate-limit events, blocklist/suppression actions, and operational errors needed to protect the service.",
    ],
    [
      "Deletion",
      "Users can disable aliases and remove recipients/domains. Operational backups and abuse/security logs may remain for limited recovery, compliance, and abuse-prevention windows.",
    ],
  ];
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Link to="/" className="text-sm text-accent hover:underline">
          ← Back to ShieldMail
        </Link>
        <h1 className="mt-8 text-4xl font-bold md:text-5xl">Privacy and data handling</h1>
        <p className="mt-4 text-muted-foreground">
          ShieldMail is designed for alias forwarding with minimal content retention. This page
          describes the current implementation, not future roadmap claims.
        </p>
        <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card-grad">
          {rows.map(([label, text]) => (
            <div
              key={label}
              className="grid gap-2 border-b border-border p-5 last:border-b-0 md:grid-cols-[180px_1fr]"
            >
              <div className="font-semibold text-foreground">{label}</div>
              <div className="text-sm leading-6 text-muted-foreground">{text}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
