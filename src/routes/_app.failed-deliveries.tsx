import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { aliasesApi, type FailedDelivery } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { AlertTriangle, MailX, ShieldAlert, MessageSquareWarning, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_app/failed-deliveries")({
  component: FailedDeliveriesPage,
});

const STATUS_LABELS: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  failed: {
    label: "Failed",
    color: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    Icon: MailX,
  },
  bounced: {
    label: "Bounced",
    color: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    Icon: AlertTriangle,
  },
  complained: {
    label: "Complained",
    color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    Icon: MessageSquareWarning,
  },
  rejected: {
    label: "Rejected",
    color: "bg-muted text-muted-foreground border-border",
    Icon: ShieldAlert,
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_LABELS[status] ?? {
    label: status,
    color: "bg-muted text-muted-foreground border-border",
    Icon: AlertTriangle,
  };
  const Icon = cfg.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.color}`}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function failureLabel(d: FailedDelivery): string {
  if (d.failureReason) return d.failureReason.replace(/_/g, " ");
  if (d.rejectionReason) return d.rejectionReason.replace(/_/g, " ");
  if (d.failureType) return d.failureType.replace(/_/g, " ");
  return "—";
}

export function FailedDeliveriesPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["failed-deliveries", statusFilter],
    queryFn: () => aliasesApi.failedDeliveries(statusFilter === "all" ? undefined : statusFilter),
  });

  const deliveries = data?.deliveries ?? [];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Failed Deliveries</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Emails that could not be delivered — bounced, failed, complained, or rejected.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44 border-border bg-surface">
              <SelectValue placeholder="All failures" />
            </SelectTrigger>
            <SelectContent className="border-border bg-surface">
              <SelectItem value="all">All failures</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="bounced">Bounced</SelectItem>
              <SelectItem value="complained">Complained</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(["failed", "bounced", "complained", "rejected"] as const).map((s) => {
          const cnt = deliveries.filter((d) => d.status === s).length;
          const cfg = STATUS_LABELS[s];
          const Icon = cfg.Icon;
          return (
            <Card
              key={s}
              className={`cursor-pointer border bg-card-grad shadow-card transition-colors ${statusFilter === s ? "border-accent/40" : "border-border"}`}
              onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {cfg.label}
                </CardTitle>
                <Icon className={`h-4 w-4 ${cfg.color.split(" ")[1]}`} />
              </CardHeader>
              <CardContent>
                <div className="font-display text-3xl font-bold">{cnt}</div>
                <p className="mt-1 text-xs text-muted-foreground">this page</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isLoading && <p className="text-muted-foreground">Loading failed deliveries...</p>}

      {!isLoading && deliveries.length === 0 && (
        <Card className="border-border bg-card-grad shadow-card">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <MailX className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <CardTitle className="mb-2 text-lg">No failed deliveries</CardTitle>
            <CardDescription>
              {statusFilter === "all"
                ? "All your forwarded emails have been delivered successfully."
                : `No ${STATUS_LABELS[statusFilter]?.label.toLowerCase() ?? statusFilter} deliveries found.`}
            </CardDescription>
          </CardContent>
        </Card>
      )}

      {deliveries.length > 0 && (
        <Card className="border-border bg-card-grad shadow-card">
          <CardHeader>
            <CardTitle className="text-base">
              {deliveries.length}{" "}
              {statusFilter === "all"
                ? "failed"
                : (STATUS_LABELS[statusFilter]?.label.toLowerCase() ?? statusFilter)}{" "}
              entr{deliveries.length !== 1 ? "ies" : "y"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface/40">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Alias
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hidden sm:table-cell">
                      From
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hidden md:table-cell">
                      Reason
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hidden lg:table-cell">
                      Provider
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d: FailedDelivery) => {
                    const alias =
                      d.aliasLocalPart && d.aliasDomain
                        ? `${d.aliasLocalPart}@${d.aliasDomain}`
                        : d.envelopeTo;
                    const date = new Date(d.createdAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    return (
                      <tr
                        key={d.id}
                        className="border-b border-border last:border-0 hover:bg-surface/30 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <StatusBadge status={d.status} />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{alias}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell truncate max-w-[160px]">
                          {d.envelopeFrom}
                        </td>
                        <td className="px-4 py-3 text-xs hidden md:table-cell">
                          <span className="text-muted-foreground capitalize">
                            {failureLabel(d)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs hidden lg:table-cell">
                          <span className="rounded-md border border-border bg-surface/50 px-2 py-0.5 text-xs uppercase text-muted-foreground">
                            {d.outboundProvider ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {date}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
