import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CreditCard, Lock, ShieldCheck, XCircle } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { plansApi, type AccountPlan, type PlanLimits, type PlanSummary } from "../lib/api";
import { cn } from "../lib/utils";

export const Route = createFileRoute("/_app/subscription")({ component: SubscriptionPage });

type DisplayPlan = Exclude<AccountPlan, "business">;

const PLAN_ORDER: DisplayPlan[] = ["free", "basic", "pro"];

const FALLBACK_LIMITS: Record<DisplayPlan, PlanLimits> = {
  free: {
    maxDomains: 1,
    maxAliases: 5,
    maxRecipients: 1,
    monthlyForwards: 100,
    pgpEnabled: false,
    customOutboundProvider: false,
    billingEnabled: false,
  },
  basic: {
    maxDomains: 3,
    maxAliases: 50,
    maxRecipients: 5,
    monthlyForwards: 2_000,
    pgpEnabled: false,
    customOutboundProvider: false,
    billingEnabled: true,
  },
  pro: {
    maxDomains: 3,
    maxAliases: 500,
    maxRecipients: 5,
    monthlyForwards: 20_000,
    pgpEnabled: true,
    customOutboundProvider: false,
    billingEnabled: true,
  },
};

const PLAN_COPY: Record<
  DisplayPlan,
  {
    name: string;
    eyebrow: string;
    price: string;
    period: string;
    note: string;
    description: string;
    cta: string;
    featured?: boolean;
  }
> = {
  free: {
    name: "Free",
    eyebrow: "Starter privacy",
    price: "$0",
    period: "Free forever",
    note: "Try it risk-free",
    description: "Start shielding your real inbox with core alias protection.",
    cta: "Start Free",
  },
  basic: {
    name: "Basic",
    eyebrow: "Personal",
    price: "$4",
    period: "/year",
    note: "About a cent a day",
    description: "A full year of protection with 3 custom domains.",
    cta: "Get Basic",
  },
  pro: {
    name: "Shield",
    eyebrow: "Best value",
    price: "$10",
    period: "/year",
    note: "Under $1/month",
    description: "Apex plan with higher capacity and priority controls.",
    cta: "Protect My Inbox",
    featured: true,
  },
};

function featuresFor(plan: DisplayPlan, limits: PlanLimits) {
  const sharedFeatures = [
    { label: "Instant alias blocking", included: true },
    { label: "Works with any inbox", included: true },
  ];
  const entitlementFeatures = [
    { label: `${limits.maxAliases.toLocaleString()} active aliases`, included: true },
    {
      label: `${limits.maxDomains} custom domain${limits.maxDomains === 1 ? "" : "s"}`,
      included: true,
    },
    {
      label: `${limits.maxRecipients} recipient${limits.maxRecipients === 1 ? "" : "s"}`,
      included: true,
    },
  ];
  const pgpFeature = limits.pgpEnabled
    ? [{ label: "OpenPGP encrypted forwarding", included: true }]
    : [];
  if (plan === "free") return [...entitlementFeatures, ...pgpFeature, ...sharedFeatures];
  if (plan === "basic")
    return [
      ...entitlementFeatures,
      ...pgpFeature,
      ...sharedFeatures,
      { label: "Email customer support", included: true },
    ];
  return [
    ...entitlementFeatures,
    ...pgpFeature,
    ...sharedFeatures,
    { label: "Chat customer support", included: true },
  ];
}
function usagePercent(used: number, max: number) {
  return Math.min(100, Math.round((used / Math.max(max, 1)) * 100));
}

function UsageBar({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = usagePercent(used, max);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {used.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent-grad transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function planDisplayName(plan: AccountPlan) {
  return plan === "pro" ? "Shield" : plan[0].toUpperCase() + plan.slice(1);
}

export function SubscriptionPage() {
  const { data: summary, isLoading } = useQuery({
    queryKey: ["plan-summary"],
    queryFn: () => plansApi.me(),
    retry: false,
  });
  const { data: tiers } = useQuery({
    queryKey: ["plan-tiers"],
    queryFn: () => plansApi.tiers(),
    retry: false,
  });
  const activePlan = summary?.plan ?? "free";
  const plans = tiers?.plans ?? FALLBACK_LIMITS;

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card-grad p-4 shadow-card md:p-5">
        <div className="absolute inset-0 grid-bg opacity-60" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge className="mb-3 gap-1 bg-accent/15 text-accent">
              <CreditCard className="h-3 w-3" /> Subscription
            </Badge>
            <h1 className="font-display text-2xl font-bold md:text-3xl">
              Simple, transparent pricing
            </h1>
          </div>
          <div className="rounded-xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm">
            <div className="text-muted-foreground">Current plan</div>
            <div className="mt-1 flex items-center gap-2 text-xl font-bold">
              <ShieldCheck className="h-5 w-5 text-accent" />
              {planDisplayName(activePlan)}
            </div>
          </div>
        </div>
      </section>

      {summary && (
        <Card className="border-border bg-card-grad shadow-card">
          <CardContent className="grid gap-5 p-6 md:grid-cols-3">
            <UsageBar
              label="Domains"
              used={summary.usage.domains}
              max={summary.limits.maxDomains}
            />
            <UsageBar
              label="Aliases"
              used={summary.usage.aliases}
              max={summary.limits.maxAliases}
            />
            <UsageBar
              label="Recipients"
              used={summary.usage.recipients}
              max={summary.limits.maxRecipients}
            />
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <p className="text-sm text-muted-foreground">
          Syncing your current usage… plan options are available below.
        </p>
      )}
      <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
        {PLAN_ORDER.map((plan) => (
          <PlanCard key={plan} plan={plan} limits={plans[plan]} summary={summary} />
        ))}
      </div>

      <Card className="border-border bg-card-grad shadow-card">
        <CardContent className="flex flex-col gap-3 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">
              Billing is configured for future checkout
            </h2>
            <p className="text-sm text-muted-foreground">
              Plan changes are currently managed by an administrator while payment automation is
              connected.
            </p>
          </div>
          <Button variant="outline" className="gap-2">
            <Lock className="h-4 w-4" /> Secure checkout coming soon
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PlanCard({
  plan,
  limits,
  summary,
}: {
  plan: DisplayPlan;
  limits: PlanLimits;
  summary?: PlanSummary;
}) {
  const copy = PLAN_COPY[plan];
  const isCurrent = (summary?.plan ?? "free") === plan;
  const features = featuresFor(plan, limits);
  return (
    <Card
      className={cn(
        "relative flex h-full overflow-hidden rounded-2xl border border-[#1a2f39] bg-[#0b1820]/90 shadow-[0_18px_50px_rgba(0,0,0,0.22)]",
        copy.featured &&
          "border-accent/70 shadow-[0_0_0_1px_rgba(16,185,129,0.18),0_18px_50px_rgba(0,0,0,0.28)]",
        isCurrent && "border-accent/80",
      )}
    >
      {copy.featured && (
        <div className="absolute inset-x-0 top-0 z-10 bg-accent/15 px-4 py-2 text-center text-xs font-semibold text-accent">
          Most Popular
        </div>
      )}
      <CardContent className="flex min-h-[430px] w-full flex-col p-6 pt-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {copy.eyebrow}
            </div>
            <h2 className="mt-2 font-display text-2xl font-bold text-foreground">{copy.name}</h2>
          </div>
          {isCurrent && <Badge className="bg-accent text-primary-foreground">Current</Badge>}
        </div>
        <div className="mt-7 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-display text-4xl font-bold text-foreground">{copy.price}</span>
          <span className="text-sm text-muted-foreground">{copy.period}</span>
        </div>
        <div className="mt-1 text-sm text-muted-foreground">{copy.note}</div>
        <p className="mt-4 min-h-12 text-sm leading-6 text-muted-foreground">{copy.description}</p>
        <div className="mt-5 flex-1 space-y-3 text-sm">
          {features.map((feature) => (
            <div
              key={feature.label}
              className={cn(
                "flex items-center gap-3",
                !feature.included && "text-muted-foreground",
              )}
            >
              {feature.included ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{feature.label}</span>
            </div>
          ))}
        </div>
        <Button
          disabled
          className={cn(
            "mt-7 w-full",
            isCurrent
              ? "border-border bg-surface text-muted-foreground"
              : "bg-accent text-primary-foreground hover:bg-accent/90",
          )}
          variant={isCurrent ? "outline" : "default"}
        >
          {isCurrent ? "Active plan" : "Request upgrade"}
        </Button>
      </CardContent>
    </Card>
  );
}
