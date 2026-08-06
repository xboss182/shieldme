import { createFileRoute } from "@tanstack/react-router";
import { Check, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Btn, Chip, PageHeader, Panel, UsageBar } from "@/components/ui-kit";
import { planSummary, planTiers } from "@/lib/mock-data";

export const Route = createFileRoute("/subscription")({
  head: () => ({
    meta: [
      { title: "Subscription — ShieldMail" },
      { name: "description", content: "Compare ShieldMail plans and track domain, alias, and recipient usage." },
      { property: "og:title", content: "Subscription — ShieldMail" },
      { property: "og:description", content: "Compare ShieldMail plans and track domain, alias, and recipient usage." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SubscriptionPage,
});

function SubscriptionPage() {
  const current = planTiers.find((p) => p.id === planSummary.plan)!;
  return (
    <AppShell eyebrow="Subscription">
      <div className="p-8 max-w-7xl w-full mx-auto">
        <PageHeader
          title="Simple, transparent pricing"
          description="Every plan includes PGP encryption and spam filtering. Upgrade only for more scale."
          actions={
            <span className="inline-flex items-center gap-2 bg-brand/10 text-brand ring-1 ring-brand/20 rounded-full px-3 py-1.5 text-xs font-medium">
              <ShieldCheck className="size-3.5" /> Current plan · {current.name}
            </span>
          }
        />

        <div className="mb-8">
          <Panel title="Usage this cycle" meta={`${planSummary.usage.monthlyForwards.toLocaleString()} forwards`}>
            <div className="grid gap-5 md:grid-cols-3">
              <UsageBar label="Domains" used={planSummary.usage.domains} max={current.limits.maxDomains} />
              <UsageBar label="Aliases" used={planSummary.usage.aliases} max={current.limits.maxAliases} />
              <UsageBar label="Recipients" used={planSummary.usage.recipients} max={current.limits.maxRecipients} />
            </div>
          </Panel>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {planTiers.map((p) => {
            const isCurrent = p.id === planSummary.plan;
            return (
              <div
                key={p.id}
                className={`relative bg-neutral-50 rounded-xl p-6 flex flex-col ring-1 ${
                  p.featured ? "ring-brand/30" : "ring-black/5"
                }`}
              >
                {p.featured ? (
                  <span className="absolute -top-2.5 left-6 bg-brand text-white text-[10px] font-medium uppercase tracking-widest px-2 py-0.5 rounded">
                    Most popular
                  </span>
                ) : null}
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">
                    {p.eyebrow}
                  </p>
                  {isCurrent ? <Chip tone="emerald">Current</Chip> : null}
                </div>
                <h2 className="mt-2 text-lg font-semibold">{p.name}</h2>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-mono tracking-tight">{p.price}</span>
                  <span className="text-xs text-neutral-400">{p.period}</span>
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">{p.note}</p>
                <p className="mt-3 text-sm text-neutral-500 text-pretty">{p.description}</p>

                <ul className="mt-5 space-y-2 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-neutral-600">
                      <Check className="size-3.5 mt-0.5 text-emerald-600 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Btn
                  variant={p.featured ? "primary" : "ghost"}
                  disabled
                  className="mt-6 w-full justify-center py-2"
                >
                  {isCurrent ? "Active plan" : "Request upgrade"}
                </Btn>
              </div>
            );
          })}
        </div>

        <div className="mt-6">
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-neutral-500 text-pretty max-w-[60ch]">
                Billing is configured for future checkout. Until then, plan changes are applied by
                an administrator on request.
              </p>
              <Btn disabled className="py-2">
                Secure checkout coming soon
              </Btn>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
