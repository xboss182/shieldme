import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/mail-security")({
  head: () => ({
    meta: [
      { title: "Mail security — ShieldMail" },
      {
        name: "description",
        content:
          "ShieldMail SPF, DKIM, DMARC, MTA-STS, TLS-RPT, DANE, SRS, bounce and complaint handling status.",
      },
    ],
  }),
  component: MailSecurityPage,
});

function MailSecurityPage() {
  const items = [
    [
      "SPF",
      "Published for ShieldMe sender domains and parsed from inbound Authentication-Results when present.",
    ],
    [
      "DKIM",
      "Customer-domain DNS guidance exists; forwarded outbound mail currently depends on Resend alignment and parsed DKIM results when present.",
    ],
    [
      "DMARC",
      "shieldme.cc remains at p=none for monitoring. Plan: review reports, quarantine at pct=25/50/100, then reject only after owner approval and alignment evidence.",
    ],
    [
      "MTA-STS / TLS-RPT",
      "Testing/reporting posture is live; enforcement progression depends on TLS report review.",
    ],
    [
      "DANE/TLSA",
      "Deferred until SMTP certificate ownership and renewal automation are stable enough to avoid mail breakage.",
    ],
    [
      "SRS / return-path",
      "Planned engineering path: rewrite forwarded return paths to an SRS domain, store reversible tokens with TTL, route bounces back to original sender context, and expose deliverability dashboards.",
    ],
    [
      "Bounces / complaints",
      "Suppression handling exists. Dedicated bounce/complaint dashboards and provider webhook reporting remain a documented gap.",
    ],
  ];
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Link to="/" className="text-sm text-accent hover:underline">
          ← Back to ShieldMail
        </Link>
        <h1 className="mt-8 text-4xl font-bold md:text-5xl">Mail security and deliverability</h1>
        <p className="mt-4 text-muted-foreground">
          Current posture and staged plans for SPF, DKIM, DMARC, MTA-STS, TLS-RPT, DANE, SRS,
          bounces, and complaints.
        </p>
        <div className="mt-8 grid gap-4">
          {items.map(([label, text]) => (
            <section key={label} className="rounded-2xl border border-border bg-card-grad p-5">
              <h2 className="font-semibold text-foreground">{label}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
