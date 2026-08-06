import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, MailWarning, RefreshCw, ThumbsDown, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  Btn,
  EmptyState,
  PageHeader,
  Panel,
  SelectInput,
  StatusPill,
  Table,
  Th,
} from "@/components/ui-kit";
import { DELIVERY_ERROR_LABELS, useFailedDeliveries, formatDateTime } from "@/lib/api";

export const Route = createFileRoute("/failed-deliveries")({
  head: () => ({
    meta: [
      { title: "Failed Deliveries — ShieldMail" },
      {
        name: "description",
        content: "Inspect bounced, rejected, and complained ShieldMail forwards.",
      },
      { property: "og:title", content: "Failed Deliveries — ShieldMail" },
      {
        property: "og:description",
        content: "Inspect bounced, rejected, and complained ShieldMail forwards.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FailedDeliveriesPage,
});

const STATUS_TONE = {
  failed: "rose",
  bounced: "amber",
  complained: "amber",
  rejected: "neutral",
} as const;

const CARDS = [
  { key: "failed", label: "Failed", icon: TriangleAlert, cls: "text-rose-500" },
  { key: "bounced", label: "Bounced", icon: MailWarning, cls: "text-amber-500" },
  { key: "complained", label: "Complained", icon: ThumbsDown, cls: "text-amber-600" },
  { key: "rejected", label: "Rejected", icon: Ban, cls: "text-neutral-400" },
] as const;

function FailedDeliveriesPage() {
  const [filter, setFilter] = useState<string>("all");
  const qc = useQueryClient();
  const { data: rows, isLoading, isError, error } = useFailedDeliveries(filter);

  const deliveries = rows ?? [];
  const countFor = (key: string) => deliveries.filter((d) => d.status === key).length;

  return (
    <AppShell
      eyebrow="Failed Deliveries"
      action={
        <Btn
          className="text-sm py-2 px-3"
          onClick={() => void qc.invalidateQueries({ queryKey: ["failed-deliveries"] })}
        >
          <RefreshCw className="size-3.5" /> Refresh
        </Btn>
      }
    >
      <div className="p-8 max-w-7xl w-full mx-auto">
        <PageHeader
          title="Failed deliveries"
          description="Every forward that didn't land, with the exact reason the upstream relay gave."
          actions={
            <SelectInput
              aria-label="Filter by status"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-44"
            >
              <option value="all">All statuses</option>
              <option value="failed">Failed</option>
              <option value="bounced">Bounced</option>
              <option value="complained">Complained</option>
              <option value="rejected">Rejected</option>
            </SelectInput>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {CARDS.map((c) => {
            const count = countFor(c.key);
            const active = filter === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setFilter(active ? "all" : c.key)}
                className={`text-left bg-neutral-50 rounded-xl p-4 ring-1 transition-colors cursor-pointer ${
                  active ? "ring-brand/40 bg-brand/5" : "ring-black/5 hover:bg-neutral-100/60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium text-neutral-400 uppercase">{c.label}</p>
                  <c.icon className={`size-3.5 ${c.cls}`} />
                </div>
                <p className="mt-1 text-xl font-mono">{String(count).padStart(2, "0")}</p>
              </button>
            );
          })}
        </div>

        <Panel title="Delivery log" meta={`${deliveries.length} events`} padded={false}>
          {isLoading ? (
            <p className="py-10 text-center text-sm text-neutral-400">Loading deliveries…</p>
          ) : isError ? (
            <p className="py-10 text-center text-sm text-rose-600">
              Couldn't load deliveries: {error instanceof Error ? error.message : "unknown error"}
            </p>
          ) : deliveries.length === 0 ? (
            <EmptyState
              title="No failed deliveries"
              description={
                filter === "all"
                  ? "Every forward in this window landed successfully."
                  : `No ${filter} events in this window.`
              }
            />
          ) : (
            <Table
              head={
                <>
                  <Th>Status</Th>
                  <Th>Alias</Th>
                  <Th>From</Th>
                  <Th>Reason</Th>
                  <Th>Provider</Th>
                  <Th align="right">Date</Th>
                </>
              }
            >
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <td className="px-6 py-3">
                    <StatusPill tone={STATUS_TONE[d.status]}>{d.status}</StatusPill>
                  </td>
                  <td className="px-6 py-3 font-mono text-xs">
                    {d.aliasLocalPart}@{d.aliasDomain}
                  </td>
                  <td className="px-6 py-3 text-xs text-neutral-500 hidden sm:table-cell">
                    {d.envelopeFrom}
                  </td>
                  <td className="px-6 py-3 hidden md:table-cell">
                    <p className="text-xs text-neutral-700">
                      {DELIVERY_ERROR_LABELS[d.failureType] ?? d.failureType}
                    </p>
                    <p className="text-[11px] font-mono text-neutral-400">{d.failureReason}</p>
                  </td>
                  <td className="px-6 py-3 text-xs font-mono text-neutral-400 hidden lg:table-cell">
                    {d.outboundProvider}
                  </td>
                  <td className="px-6 py-3 text-right text-xs font-mono text-neutral-500">
                    {formatDateTime(d.createdAt)}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
