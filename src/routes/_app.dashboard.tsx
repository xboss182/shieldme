import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { domainsApi, recipientsApi, aliasesApi } from "../lib/api";
import {
  Globe,
  Users,
  Mail,
  ArrowUpRight,
  ShieldOff,
  ShieldCheck,
  ShieldAlert,
  Tags,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

export const Route = createFileRoute("/_app/dashboard")({ component: DashboardPage });

export function DashboardPage() {
  const { data: domsData } = useQuery({ queryKey: ["domains"], queryFn: () => domainsApi.list() });
  const { data: recData } = useQuery({
    queryKey: ["recipients"],
    queryFn: () => recipientsApi.list(),
  });
  const { data: aliData } = useQuery({ queryKey: ["aliases"], queryFn: () => aliasesApi.list() });
  const { data: statsData } = useQuery({
    queryKey: ["alias-stats"],
    queryFn: () => aliasesApi.stats(),
  });

  const domains = domsData?.domains ?? [];
  const recipients = recData?.recipients ?? [];
  const aliases = aliData?.aliases ?? [];
  const activeAliases = aliases.filter((a) => a.status === "active").length;
  const pgpProtected = aliases.filter((a) => a.pgpMode && a.pgpMode !== "none").length;
  const totalForwarded = statsData?.totalForwarded ?? 0;
  const totalBlocked = statsData?.totalBlocked ?? 0;
  const totalSpamTagged = statsData?.totalSpamTagged ?? 0;
  const totalSpamRejected = statsData?.totalSpamRejected ?? 0;
  const totalSpamQuarantined = statsData?.totalSpamQuarantined ?? 0;
  const totalSpamDetected =
    statsData?.totalSpamDetected ?? totalSpamTagged + totalSpamRejected + totalSpamQuarantined;
  const perAlias = statsData?.perAlias ?? {};

  const stats = [
    {
      label: "Total Aliases",
      value: aliases.length,
      icon: Mail,
      sub: activeAliases + " active",
      color: "text-accent",
    },
    {
      label: "Emails Forwarded",
      value: totalForwarded,
      icon: ArrowUpRight,
      sub: "successfully delivered",
      color: "text-emerald-500",
    },
    {
      label: "Emails Blocked",
      value: totalBlocked,
      icon: ShieldOff,
      sub: "policy rejects",
      color: "text-amber-500",
    },
    {
      label: "Spam Detected",
      value: totalSpamDetected,
      icon: ShieldAlert,
      sub: `${totalSpamRejected + totalSpamQuarantined} blocked · ${totalSpamTagged} tagged`,
      color: "text-rose-500",
    },
    {
      label: "Domains",
      value: domains.length,
      icon: Globe,
      sub: domains.filter((d) => d.status === "verified").length + " verified",
      color: "text-blue-500",
    },
    {
      label: "Recipients",
      value: recipients.length,
      icon: Users,
      sub: recipients.filter((r) => r.status === "verified").length + " verified",
      color: "text-violet-500",
    },
    {
      label: "PGP Protected",
      value: pgpProtected,
      icon: ShieldCheck,
      sub: "aliases with encryption",
      color: "text-accent",
    },
  ];

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-bold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="border-border bg-card-grad shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className={`h-4 w-4 ${s.color}`} />
            </CardHeader>
            <CardContent>
              <div className="font-display text-3xl font-bold">{s.value}</div>
              <p className="mt-1 text-xs text-muted-foreground">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {aliases.length > 0 && (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Recent Aliases</h2>
            <Link to="/aliases" className="text-sm font-medium text-accent hover:underline">
              View all →
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card-grad shadow-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface/40">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Address</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">
                    Forward to
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground hidden md:table-cell">
                    Forwarded
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground hidden md:table-cell">
                    Blocked
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground hidden lg:table-cell">
                    Spam
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">
                    PGP
                  </th>
                </tr>
              </thead>
              <tbody>
                {aliases.slice(0, 5).map((a) => {
                  const address = a.domain ? a.localPart + "@" + a.domain.domain : a.localPart;
                  const aliasStats = perAlias[a.id];
                  const createdDate = new Date(a.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });
                  return (
                    <tr key={a.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            a.status === "active"
                              ? "bg-emerald-500/10 text-emerald-500"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${a.status === "active" ? "bg-emerald-500" : "bg-muted-foreground"}`}
                          />
                          {a.status === "active" ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{address}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                        {a.recipient?.email ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-xs hidden md:table-cell">
                        <span className="font-semibold">{aliasStats?.forwarded ?? 0}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs hidden md:table-cell">
                        <span className="font-semibold">{aliasStats?.blocked ?? 0}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs hidden lg:table-cell">
                        <span className="font-semibold text-rose-400">
                          {(aliasStats?.spamTagged ?? 0) +
                            (aliasStats?.spamRejected ?? 0) +
                            (aliasStats?.spamQuarantined ?? 0)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs hidden lg:table-cell">
                        {a.pgpMode && a.pgpMode !== "none" ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                              a.pgpMode === "required"
                                ? "bg-accent/20 text-accent"
                                : "bg-blue-500/10 text-blue-400"
                            }`}
                          >
                            <ShieldCheck className="h-3 w-3" />
                            {a.pgpMode}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
