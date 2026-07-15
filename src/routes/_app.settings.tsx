import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "../lib/auth";
import { useQuery } from "@tanstack/react-query";
import { plansApi, type PlanSummary } from "../lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Shield, Mail, CheckCircle2, Gauge, Lock, Server } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

function planLabel(plan?: string) {
  if (plan === "pro") return "Shield";
  return plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : "Free";
}

function formatLimit(value: number) {
  if (value >= 100_000) return "Fair use";
  return value.toLocaleString();
}

function usagePercent(used: number, max: number) {
  if (max >= 100_000) return Math.min(100, Math.round((used / 10_000) * 100));
  return Math.min(100, Math.round((used / Math.max(max, 1)) * 100));
}

function LimitRow({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = usagePercent(used, max);
  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface/45 p-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-xs font-semibold text-foreground">
          {used.toLocaleString()} / {formatLimit(max)}
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

const FALLBACK_LIMITS: Record<string, PlanSummary> = {
  free: {
    plan: "free",
    usage: { domains: 0, aliases: 0, recipients: 0, monthlyForwards: 0 },
    limits: {
      maxDomains: 1,
      maxAliases: 5,
      maxRecipients: 1,
      monthlyForwards: 1000,
      pgpEnabled: true,
      customOutboundProvider: false,
      billingEnabled: false,
    },
  },
  basic: {
    plan: "basic",
    usage: { domains: 0, aliases: 0, recipients: 0, monthlyForwards: 0 },
    limits: {
      maxDomains: 3,
      maxAliases: 50,
      maxRecipients: 5,
      monthlyForwards: 5000,
      pgpEnabled: true,
      customOutboundProvider: false,
      billingEnabled: true,
    },
  },
  pro: {
    plan: "pro",
    usage: { domains: 0, aliases: 0, recipients: 0, monthlyForwards: 0 },
    limits: {
      maxDomains: 3,
      maxAliases: 500,
      maxRecipients: 5,
      monthlyForwards: 20000,
      pgpEnabled: true,
      customOutboundProvider: true,
      billingEnabled: true,
    },
  },
};

function AccountLimits({ plan, fallbackPlan }: { plan?: PlanSummary; fallbackPlan?: string }) {
  const currentPlan = plan ?? FALLBACK_LIMITS[fallbackPlan ?? "free"] ?? FALLBACK_LIMITS.free;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent/10 p-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Current plan</div>
          <div className="mt-1 text-xl font-semibold text-foreground">
            {planLabel(currentPlan.plan)}
          </div>
        </div>
        <Badge className="gap-1 bg-accent/20 text-accent border-accent/30">
          <CheckCircle2 className="h-3 w-3" /> Active
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <LimitRow
          label="Custom domains"
          used={currentPlan.usage.domains}
          max={currentPlan.limits.maxDomains}
        />
        <LimitRow
          label="Aliases"
          used={currentPlan.usage.aliases}
          max={currentPlan.limits.maxAliases}
        />
        <LimitRow
          label="Recipients"
          used={currentPlan.usage.recipients}
          max={currentPlan.limits.maxRecipients}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/45 p-3 text-sm">
          <Lock className="h-4 w-4 text-accent" />
          <div>
            <div className="font-medium text-foreground">PGP encryption</div>
            <div className="text-xs text-muted-foreground">Included on every plan</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/45 p-3 text-sm">
          <Server className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="font-medium text-foreground">Custom outbound provider</div>
            <div className="text-xs text-muted-foreground">
              {currentPlan.limits.customOutboundProvider ? "Included" : "Managed by ShieldMail"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const { data: plan } = useQuery({ queryKey: ["plan-summary"], queryFn: () => plansApi.me() });

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-bold">Settings</h1>

      <div className="max-w-3xl space-y-6">
        <Card className="border-border bg-card-grad shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-accent" />
              Account
            </CardTitle>
            <CardDescription>Your account information and current plan limits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 rounded-xl border border-border bg-surface/30 p-4 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Email</div>
                <div className="mt-1 flex items-center gap-2 break-all font-mono text-sm text-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {user?.email}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Account type
                </div>
                <Badge className="mt-1 gap-1 bg-accent/20 text-accent border-accent/30">
                  <CheckCircle2 className="h-3 w-3" />
                  {user?.role === "admin" ? "Administrator" : "Standard"}
                </Badge>
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Gauge className="h-4 w-4 text-accent" /> Account limits
              </div>
              <AccountLimits plan={plan} fallbackPlan={user?.plan} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card-grad shadow-card">
          <CardHeader>
            <CardTitle>How it works</CardTitle>
            <CardDescription>Quick guide to ShieldMail</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">1. Add a domain</strong> — Register your custom
              domain or use{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">@shieldme.cc</code>.
            </p>
            <p>
              <strong className="text-foreground">2. Add a recipient</strong> — Verify the real
              inbox where emails should land.
            </p>
            <p>
              <strong className="text-foreground">3. Create aliases</strong> — Generate unique
              addresses that forward to your real inbox.
            </p>
            <p>
              <strong className="text-foreground">4. Use anywhere</strong> — Give your alias to
              websites, services, or people. Toggle off or delete anytime.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
