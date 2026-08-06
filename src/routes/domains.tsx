import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  Btn,
  Chip,
  ConfirmDialog,
  CopyButton,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Panel,
  StatusPill,
  TextInput,
} from "@/components/ui-kit";
import {
  useAddDomain,
  useDeleteDomain,
  useDomain,
  useDomains,
  useVerifyDomain,
  formatDate,
  type DnsRecord,
  type Domain,
} from "@/lib/api";

export const Route = createFileRoute("/domains")({
  head: () => ({
    meta: [
      { title: "Domains — ShieldMail" },
      {
        name: "description",
        content: "Verify custom domains, review DNS records, and manage ShieldMail mail routing.",
      },
      { property: "og:title", content: "Domains — ShieldMail" },
      {
        property: "og:description",
        content: "Verify custom domains, review DNS records, and manage ShieldMail mail routing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DomainsPage,
});

function DomainsPage() {
  const { data: list, isLoading, isError, error } = useDomains();
  const addDomain = useAddDomain();
  const verifyDomain = useVerifyDomain();
  const deleteDomain = useDeleteDomain();

  const [addOpen, setAddOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<Domain | null>(null);

  const domains = list ?? [];

  return (
    <AppShell
      eyebrow="Domains"
      action={
        <Btn variant="primary" onClick={() => setAddOpen(true)} className="text-sm py-2 px-3">
          <Plus className="size-3.5" /> Add domain
        </Btn>
      }
    >
      <div className="p-8 max-w-7xl w-full mx-auto">
        <PageHeader
          title="Domains"
          description="Use the shared shieldme.cc domain instantly, or bring your own and prove ownership with two DNS records."
        />

        {isLoading ? (
          <Panel>
            <p className="py-10 text-center text-sm text-neutral-400">Loading domains…</p>
          </Panel>
        ) : isError ? (
          <Panel>
            <p className="py-10 text-center text-sm text-rose-600">
              Couldn't load domains: {error instanceof Error ? error.message : "unknown error"}
            </p>
          </Panel>
        ) : domains.length === 0 ? (
          <Panel>
            <EmptyState
              title="No domains yet"
              description="Use the shared shieldme.cc domain or add your own custom domain."
            />
          </Panel>
        ) : (
          <div className="space-y-3">
            {domains.map((d) => (
              <DomainRow
                key={d.id}
                domain={d}
                expanded={expanded === d.id}
                check={checks[d.id]}
                onToggleExpanded={() => setExpanded(expanded === d.id ? null : d.id)}
                onVerify={() => {
                  verifyDomain.mutate(d.id, {
                    onSuccess: () =>
                      setChecks((c) => ({
                        ...c,
                        [d.id]: "Verify request accepted — check status",
                      })),
                    onError: (err) =>
                      setChecks((c) => ({
                        ...c,
                        [d.id]: err instanceof Error ? err.message : "Verification failed",
                      })),
                  });
                }}
                onDelete={() => setPendingDelete(d)}
              />
            ))}
          </div>
        )}
      </div>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add domain"
        description="You'll get MX and TXT records to publish at your DNS provider."
      >
        <div className="space-y-4">
          <Field label="Domain">
            <TextInput
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="example.com"
            />
          </Field>
          {addDomain.isError ? (
            <p className="text-xs text-rose-600">
              {addDomain.error instanceof Error ? addDomain.error.message : "Add failed"}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setAddOpen(false)}>Cancel</Btn>
            <Btn
              variant="primary"
              disabled={!newDomain.trim() || addDomain.isPending}
              onClick={() =>
                addDomain.mutate(newDomain.trim(), {
                  onSuccess: () => {
                    setNewDomain("");
                    setAddOpen(false);
                  },
                })
              }
            >
              {addDomain.isPending ? "Adding…" : "Add domain"}
            </Btn>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteDomain.mutate(pendingDelete.id);
        }}
        title="Delete this domain?"
        description={`Every alias on ${pendingDelete?.domain} will stop receiving mail immediately.`}
      />
    </AppShell>
  );
}

function DomainRow({
  domain: d,
  expanded,
  check,
  onToggleExpanded,
  onVerify,
  onDelete,
}: {
  domain: Domain;
  expanded: boolean;
  check?: string;
  onToggleExpanded: () => void;
  onVerify: () => void;
  onDelete: () => void;
}) {
  const { data: detail } = useDomain(expanded && !d.isShared ? d.id : "");
  const records = detail?.dnsRecords;

  return (
    <div className="bg-neutral-50 ring-1 ring-black/5 rounded-xl">
      <div className="p-5 flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium">{d.domain}</span>
            {d.isShared ? <Chip>Shared</Chip> : null}
            <StatusPill
              tone={d.status === "verified" ? "emerald" : d.status === "pending" ? "amber" : "rose"}
            >
              {d.status === "verified" ? "Verified" : d.status === "pending" ? "Pending" : "Failed"}
            </StatusPill>
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            {d.isShared
              ? "Ready to use — no DNS setup required"
              : d.verifiedAt
                ? `Verified ${formatDate(d.verifiedAt)}${d.dkimSelector ? ` · DKIM selector ${d.dkimSelector}` : ""}`
                : `Added ${formatDate(d.createdAt)} · awaiting DNS propagation`}
          </p>
          {check ? <p className="mt-2 text-xs font-mono text-rose-600">{check}</p> : null}
        </div>

        <div className="flex items-center gap-2">
          {!d.isShared ? (
            <>
              <Btn onClick={onToggleExpanded}>{expanded ? "Hide DNS" : "Show DNS"}</Btn>
              <Btn onClick={onVerify}>Verify</Btn>
              <Btn variant="danger" onClick={onDelete}>
                <Trash2 className="size-3.5" />
              </Btn>
            </>
          ) : (
            <Chip tone="emerald">Managed</Chip>
          )}
        </div>
      </div>

      {expanded && !d.isShared ? (
        <div className="border-t border-neutral-200/60 p-5 space-y-6">
          {records ? (
            <>
              <RecordGroup title="Required records" records={records.required} />
              <RecordGroup title="Recommended for deliverability" records={records.optional} />
            </>
          ) : (
            <p className="text-xs text-neutral-400">Loading DNS records…</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function RecordGroup({ title, records }: { title: string; records: DnsRecord[] }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 mb-3">
        {title}
      </p>
      <div className="space-y-2">
        {records.map((r) => (
          <div
            key={`${r.type}-${r.name}`}
            className="bg-white ring-1 ring-black/5 rounded-lg p-3 grid gap-2 md:grid-cols-[80px_1fr_1fr]"
          >
            <div>
              <p className="text-[10px] uppercase tracking-widest text-neutral-400">Type</p>
              <p className="font-mono text-xs mt-0.5">
                {r.type}
                {r.priority ? <span className="text-neutral-400"> · prio {r.priority}</span> : null}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-neutral-400">Host</p>
              <div className="flex items-center gap-2">
                <p className="font-mono text-xs mt-0.5 truncate">{r.name}</p>
                <CopyButton value={r.name} />
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-neutral-400">Value</p>
              <div className="flex items-center gap-2">
                <p className="font-mono text-xs mt-0.5 truncate">{r.value}</p>
                <CopyButton value={r.value} />
              </div>
              {r.note ? <p className="text-[11px] text-neutral-400 mt-1">{r.note}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
