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
import { domains as seedDomains, formatDate, type DnsRecord, type Domain } from "@/lib/mock-data";

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
  const [list, setList] = useState<Domain[]>(seedDomains);
  const [addOpen, setAddOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<Domain | null>(null);

  function verify(d: Domain) {
    const ok = d.status !== "failed";
    setChecks((c) => ({
      ...c,
      [d.id]: ok
        ? "MX ok · TXT ok — domain verified"
        : "MX missing · TXT mismatch — check your DNS provider",
    }));
    if (ok) {
      setList((prev) =>
        prev.map((x) =>
          x.id === d.id
            ? { ...x, status: "verified", isActive: true, verifiedAt: new Date().toISOString() }
            : x,
        ),
      );
    }
  }

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

        {list.length === 0 ? (
          <Panel>
            <EmptyState
              title="No domains yet"
              description="Use the shared shieldme.cc domain or add your own custom domain."
            />
          </Panel>
        ) : (
          <div className="space-y-3">
            {list.map((d) => (
              <div key={d.id} className="bg-neutral-50 ring-1 ring-black/5 rounded-xl">
                <div className="p-5 flex flex-wrap items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium">{d.domain}</span>
                      {d.isShared ? <Chip>Shared</Chip> : null}
                      <StatusPill
                        tone={
                          d.status === "verified"
                            ? "emerald"
                            : d.status === "pending"
                              ? "amber"
                              : "rose"
                        }
                      >
                        {d.status === "verified"
                          ? "Verified"
                          : d.status === "pending"
                            ? "Pending"
                            : "Failed"}
                      </StatusPill>
                    </div>
                    <p className="mt-1 text-xs text-neutral-400">
                      {d.isShared
                        ? "Ready to use — no DNS setup required"
                        : d.verifiedAt
                          ? `Verified ${formatDate(d.verifiedAt)} · DKIM selector ${d.dkimSelector}`
                          : `Added ${formatDate(d.createdAt)} · awaiting DNS propagation`}
                    </p>
                    {checks[d.id] ? (
                      <p
                        className={`mt-2 text-xs font-mono ${
                          checks[d.id].includes("missing") ? "text-rose-600" : "text-emerald-600"
                        }`}
                      >
                        {checks[d.id]}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    {!d.isShared ? (
                      <>
                        <Btn onClick={() => setExpanded(expanded === d.id ? null : d.id)}>
                          {expanded === d.id ? "Hide DNS" : "Show DNS"}
                        </Btn>
                        <Btn onClick={() => verify(d)}>Verify</Btn>
                        <Btn variant="danger" onClick={() => setPendingDelete(d)}>
                          <Trash2 className="size-3.5" />
                        </Btn>
                      </>
                    ) : (
                      <Chip tone="emerald">Managed</Chip>
                    )}
                  </div>
                </div>

                {expanded === d.id && !d.isShared ? (
                  <div className="border-t border-neutral-200/60 p-5 space-y-6">
                    <RecordGroup title="Required records" records={d.dnsRecords.required} />
                    <RecordGroup
                      title="Recommended for deliverability"
                      records={d.dnsRecords.optional}
                    />
                  </div>
                ) : null}
              </div>
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
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setAddOpen(false)}>Cancel</Btn>
            <Btn
              variant="primary"
              disabled={!newDomain.trim()}
              onClick={() => {
                const id = `dom_${Math.random().toString(36).slice(2, 7)}`;
                const selector = `sm${list.length + 1}`;
                setList((prev) => [
                  ...prev,
                  {
                    id,
                    domain: newDomain.trim(),
                    status: "pending",
                    isActive: false,
                    isShared: false,
                    dkimSelector: selector,
                    verifiedAt: null,
                    createdAt: new Date().toISOString(),
                    dnsRecords: {
                      required: [
                        {
                          type: "MX",
                          name: newDomain.trim(),
                          value: "inbound.shieldme.cc",
                          priority: 10,
                          note: "Routes inbound mail into the ShieldMail filter pipeline.",
                        },
                        {
                          type: "TXT",
                          name: `_shieldme.${newDomain.trim()}`,
                          value: `shieldme-verify=${selector}-${Math.random().toString(16).slice(2, 12)}`,
                          note: "Ownership proof. Keep this record permanently.",
                        },
                      ],
                      optional: [
                        {
                          type: "TXT",
                          name: newDomain.trim(),
                          value: "v=spf1 include:spf.shieldme.cc ~all",
                          note: "SPF — authorises ShieldMail to send on your behalf.",
                        },
                        {
                          type: "TXT",
                          name: `_dmarc.${newDomain.trim()}`,
                          value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@shieldme.cc",
                          note: "DMARC — reporting and policy enforcement.",
                        },
                      ],
                    },
                  },
                ]);
                setNewDomain("");
                setAddOpen(false);
              }}
            >
              Add domain
            </Btn>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => setList((prev) => prev.filter((x) => x.id !== pendingDelete?.id))}
        title="Delete this domain?"
        description={`Every alias on ${pendingDelete?.domain} will stop receiving mail immediately.`}
      />
    </AppShell>
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
                {r.priority ? (
                  <span className="text-neutral-400"> · prio {r.priority}</span>
                ) : null}
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
