import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Chip, PageHeader, Panel, StatusPill, UsageBar } from "@/components/ui-kit";
import { useMe, usePlan } from "@/lib/api";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — ShieldMail" },
      {
        name: "description",
        content: "Account details, plan limits, and how ShieldMail forwarding works.",
      },
      { property: "og:title", content: "Settings — ShieldMail" },
      {
        property: "og:description",
        content: "Account details, plan limits, and how ShieldMail forwarding works.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const steps = [
  {
    title: "Add a domain",
    body: "Use the shared shieldme.cc domain or verify your own with two DNS records.",
  },
  { title: "Add a recipient", body: "Confirm the real inbox that should receive forwarded mail." },
  { title: "Create aliases", body: "Generate a unique address per service and set its PGP mode." },
  {
    title: "Use it anywhere",
    body: "Mail is filtered, optionally encrypted, then forwarded to you.",
  },
];

function SettingsPage() {
  const { data: me } = useMe();
  const { data: plan, isLoading, isError, error } = usePlan();

  return (
    <AppShell eyebrow="Settings">
      <div className="p-8 max-w-7xl w-full mx-auto">
        <PageHeader
          title="Settings"
          description="Your account identity and the limits attached to your current ShieldMail plan."
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Panel title="Account">
              <dl className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Email
                  </dt>
                  <dd className="font-mono text-sm">{me?.email ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Account type
                  </dt>
                  <dd>
                    <StatusPill tone="neutral">Standard</StatusPill>
                  </dd>
                </div>
              </dl>
            </Panel>

            <Panel title="Account limits" meta={plan ? `${plan.plan} plan` : "…"}>
              {isLoading ? (
                <p className="py-6 text-center text-sm text-neutral-400">Loading plan…</p>
              ) : isError ? (
                <p className="py-6 text-center text-sm text-rose-600">
                  Couldn't load plan: {error instanceof Error ? error.message : "unknown error"}
                </p>
              ) : plan ? (
                <>
                  <div className="flex items-center justify-between bg-white ring-1 ring-black/5 rounded-lg px-3 py-2 mb-5">
                    <span className="text-sm font-medium capitalize">{plan.plan}</span>
                    <Chip tone="emerald">Active</Chip>
                  </div>
                  <div className="space-y-4">
                    <UsageBar
                      label="Custom domains"
                      used={plan.usage.domains}
                      max={plan.limits.maxDomains}
                    />
                    <UsageBar
                      label="Aliases"
                      used={plan.usage.aliases}
                      max={plan.limits.maxAliases}
                    />
                    <UsageBar
                      label="Recipients"
                      used={plan.usage.recipients}
                      max={plan.limits.maxRecipients}
                    />
                  </div>
                  <div className="mt-5 space-y-2 text-xs">
                    <FeatureRow
                      label="PGP encryption"
                      value={plan.limits.pgpEnabled ? "Included" : "Not on this plan"}
                      ok={plan.limits.pgpEnabled}
                    />
                    <FeatureRow
                      label="Custom outbound provider"
                      value={
                        plan.limits.customOutboundProvider ? "Included" : "Managed by ShieldMail"
                      }
                      ok={plan.limits.customOutboundProvider}
                    />
                  </div>
                </>
              ) : null}
            </Panel>
          </div>

          <Panel title="How it works">
            <ol className="space-y-5">
              {steps.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="size-6 shrink-0 rounded-md bg-brand/10 text-brand font-mono text-xs flex items-center justify-center ring-1 ring-brand/20">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="text-xs text-neutral-500 mt-0.5 text-pretty">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function FeatureRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between border-t border-neutral-200/60 pt-2">
      <span className="text-neutral-500">{label}</span>
      <span className={ok ? "text-emerald-600 font-medium" : "text-neutral-400"}>{value}</span>
    </div>
  );
}
