import { createFileRoute } from "@tanstack/react-router";
import { Check, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Btn, Chip, PageHeader, Panel, UsageBar } from "@/components/ui-kit";
import { usePlan, usePlanTiers, type AccountPlan, type PlanLimits } from "@/lib/api";

export const Route = createFileRoute("/subscription")({
  head: () => ({
    meta: [
      { title: "Subscription — ShieldMail" },
      {
        name: "description",
        content: "Compare ShieldMail plans and track domain, alias, and recipient usage.",
      },
      { property: "og:title", content: "Subscription — ShieldMail" },
      {
        property: "og:description",
        content: "Compare ShieldMail plans and track domain, alias, and recipient usage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SubscriptionPage,
});

const PLAN_COPY: Record<
  AccountPlan,
  {
    eyebrow: string;
    name: string;
    price: string;
    period: string;
    note: string;
    description: string;
    featured: boolean;
  }
> = {
  free: {
    eyebrow: "Starter",
    name: "Free",
    price: "$0",
    period: "/month",
    note: "No card required",
    description: "Try aliasing on the shared shieldme.cc domain.",
    featured: false,
  },
  basic: {
    eyebrow: "Everyday",
    name: "Basic",
    price: "$4",
    period: "/month",
    note: "Billed annually",
    description: "Bring your own domain and split mail across inboxes.",
    featured: true,
  },
  pro: {
    eyebrow: "Power user",
    name: "Shield",
    price: "$12",
    period: "/month",
    note: "Billed annually",
    description: "Unlimited-scale aliasing with your own outbound provider.",
    featured: false,
  },
  business: {
    eyebrow: "Scale",
    name: "Business",
    price: "Custom",
    period: "",
    note: "Let's talk",
    description: "High-volume aliasing with dedicated scale and support.",
    featured: false,
  },
};

function TierCard({ id, limits }: { id: AccountPlan; limits: PlanLimits }) {
  const copy = PLAN_COPY[id];
  const features = [
    `${limits.maxDomains} custom domain${limits.maxDomains === 1 ? "" : "s"}`,
    `${limits.maxAliases.toLocaleString()} aliases`,
    `${limits.maxRecipients} recipient${limits.maxRecipients === 1 ? "" : "s"}`,
    limits.pgpEnabled ? "PGP encryption included" : "No PGP encryption",
    limits.customOutboundProvider ? "Custom outbound provider" : "Managed outbound provider",
  ];
  return (
    <div
      className={`relative bg-neutral-50 rounded-xl p-6 flex flex-col ring-1 ${
        copy.featured ? "ring-brand/30" : "ring-black/5"
      }`}
    >
      {copy.featured ? (
        <span className="absolute -top-2.5 left-6 bg-brand text-white text-[10px] font-medium uppercase tracking-widest px-2 py-0.5 rounded">
          Most popular
        </span>
      ) : null}
      <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">
        {copy.eyebrow}
      </p>
      <h2 className="mt-2 text-lg font-semibold">{copy.name}</h2>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-3xl font-mono tracking-tight">{copy.price}</span>
        {copy.period ? <span className="text-xs text-neutral-400">{copy.period}</span> : null}
      </div>
      <p className="text-[11px] text-neutral-400 mt-1">{copy.note}</p>
      <p className="mt-3 text-sm text-neutral-500 text-pretty">{copy.description}</p>

      <ul className="mt-5 space-y-2 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-neutral-600">
            <Check className="size-3.5 mt-0.5 text-emerald-600 shrink-0" />
            {f}
          </li>
        ))}
      </ul>

      <Btn
        variant={copy.featured ? "primary" : "ghost"}
        disabled
        className="mt-6 w-full justify-center py-2"
      >
        Request upgrade
      </Btn>
    </div>
  );
}

function SubscriptionPage() {
  const { data: plan, isLoading, isError, error } = usePlan();
  const { data: limitMap } = usePlanTiers();

  const tiers = (Object.entries(limitMap ?? {}) as [AccountPlan, PlanLimits][]).sort(
    ([a], [b]) => PLAN_ORDER[a] - PLAN_ORDER[b],
  );

  return (
    <AppShell eyebrow="Subscription">
      <div className="p-8 max-w-7xl w-full mx-auto">
        <PageHeader
          title="Simple, transparent pricing"
          description="Every plan includes spam filtering. Upgrade only for more scale."
          actions={
            <span className="inline-flex items-center gap-2 bg-brand/10 text-brand ring-1 ring-brand/20 rounded-full px-3 py-1.5 text-xs font-medium">
              <ShieldCheck className="size-3.5" /> Current plan ·{" "}
              {plan ? (PLAN_COPY[plan.plan]?.name ?? plan.plan) : "…"}
            </span>
          }
        />

        <div className="mb-8">
          <Panel
            title="Usage this cycle"
            meta={plan ? `${plan.usage.monthlyForwards.toLocaleString()} forwards` : "…"}
          >
            {isLoading ? (
              <p className="py-6 text-center text-sm text-neutral-400">Loading plan…</p>
            ) : isError ? (
              <p className="py-6 text-center text-sm text-rose-600">
                Couldn't load plan: {error instanceof Error ? error.message : "unknown error"}
              </p>
            ) : plan ? (
              <div className="grid gap-5 md:grid-cols-3">
                <UsageBar label="Domains" used={plan.usage.domains} max={plan.limits.maxDomains} />
                <UsageBar label="Aliases" used={plan.usage.aliases} max={plan.limits.maxAliases} />
                <UsageBar
                  label="Recipients"
                  used={plan.usage.recipients}
                  max={plan.limits.maxRecipients}
                />
              </div>
            ) : null}
          </Panel>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {tiers.map(([id, limits]) => (
            <TierCard key={id} id={id} limits={limits} />
          ))}
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

const PLAN_ORDER: Record<AccountPlan, number> = { free: 0, basic: 1, pro: 2, business: 3 };
