import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  CircleGauge,
  Fingerprint,
  Globe,
  Inbox,
  Lock,
  ScrollText,
  Send,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  Btn,
  Chip,
  Field,
  Panel,
  SelectInput,
  StatusPill,
  Table,
  TextInput,
  Th,
} from "@/components/ui-kit";
import {
  DELIVERY_ERROR_LABELS,
  adminAliases as seedAdminAliases,
  adminDeliveries,
  adminDomains as seedAdminDomains,
  adminStats,
  adminUsers as seedAdminUsers,
  auditLogs,
  formatDateTime,
  planTiers,
  reservedLocalParts as seedReserved,
  type AccountPlan,
  type ReservedLocalPart,
} from "@/lib/mock-data";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Console — ShieldMail" },
      { name: "description", content: "Platform administration for ShieldMail users, domains, aliases, and delivery." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Admin Console — ShieldMail" },
      { property: "og:description", content: "Platform administration for ShieldMail users, domains, aliases, and delivery." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

const TABS = [
  "Overview",
  "Users",
  "Plans",
  "Domains",
  "Aliases",
  "Reserved",
  "Deliveries",
  "Audit Logs",
] as const;
type Tab = (typeof TABS)[number];

const TAB_META: Record<Tab, { icon: LucideIcon; group: string; blurb: string }> = {
  Overview: { icon: CircleGauge, group: "Platform", blurb: "Live counters across the whole estate." },
  Users: { icon: Users, group: "Directory", blurb: "Accounts, plan assignment, and suspension." },
  Plans: { icon: Activity, group: "Directory", blurb: "Tier limits and per-account subscriptions." },
  Domains: { icon: Globe, group: "Directory", blurb: "Registered domains and verification state." },
  Aliases: { icon: Inbox, group: "Directory", blurb: "Every alias on the platform." },
  Reserved: { icon: Lock, group: "Directory", blurb: "Reserve or allow specific local-parts." },
  Deliveries: { icon: Send, group: "Delivery", blurb: "Forwarding outcomes and failure reasons." },
  "Audit Logs": { icon: ScrollText, group: "Delivery", blurb: "Immutable trail of admin actions." },
};

const GROUPS = ["Platform", "Directory", "Delivery"] as const;


function AdminPage() {
  const [tab, setTab] = useState<Tab>("Overview");
  const [query, setQuery] = useState("");
  const [secret, setSecret] = useState("");
  const [secretSaved, setSecretSaved] = useState(false);

  const [users, setUsers] = useState(seedAdminUsers);
  const [domains, setDomains] = useState(seedAdminDomains);
  const [aliases, setAliases] = useState(seedAdminAliases);
  const [reserved, setReserved] = useState<ReservedLocalPart[]>(seedReserved);

  const q = query.trim().toLowerCase();
  const showSearch = tab !== "Overview";

  const counts: Partial<Record<Tab, number>> = {
    Users: users.length,
    Domains: domains.length,
    Aliases: aliases.length,
    Reserved: reserved.length,
    Deliveries: adminDeliveries.length,
    "Audit Logs": auditLogs.length,
    Plans: planTiers.length,
  };

  return (
    <AppShell eyebrow="Admin Console">
      <div className="p-8 max-w-7xl w-full mx-auto">
        <div className="mb-8 rounded-xl bg-neutral-50 ring-1 ring-black/5 overflow-hidden">
          <div className="px-6 py-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Fingerprint className="size-4 text-brand" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">
                  Privileged session
                </span>
                <Chip tone="brand">root</Chip>
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">Admin console</h1>
              <p className="text-sm text-neutral-500 mt-1 max-w-[62ch] text-pretty">
                Platform-wide moderation, plan assignment, delivery forensics, and configuration.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-white ring-1 ring-black/5 p-1.5">
              <Lock className="size-3.5 ml-1 text-neutral-400" />
              <TextInput
                type="password"
                placeholder="ADMIN_SECRET"
                aria-label="Admin secret"
                value={secret}
                onChange={(e) => {
                  setSecret(e.target.value);
                  setSecretSaved(false);
                }}
                className="w-44 font-mono text-xs"
              />
              <Btn
                variant={secretSaved ? "ghost" : "primary"}
                onClick={() => setSecretSaved(secret.length > 0)}
              >
                {secretSaved ? "Unlocked" : "Unlock"}
              </Btn>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-neutral-200/60 border-t border-neutral-200/60">
            <Stat label="Users" value={adminStats.users} />
            <Stat label="Domains" value={adminStats.domains} />
            <Stat label="Aliases" value={adminStats.aliases} />
            <Stat label="Queue depth" value={adminStats.queueDepth} tone="amber" />
            <Stat label="PGP deliveries" value={adminStats.pgpDeliveries} tone="emerald" />
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] items-start">
          <nav className="lg:sticky lg:top-8 flex lg:block gap-1 overflow-x-auto -mx-1 px-1 pb-1">
            {GROUPS.map((group) => (
              <div key={group} className="lg:mb-4 shrink-0 lg:shrink">
                <p className="hidden lg:block px-2 mb-1 text-[10px] font-mono uppercase tracking-widest text-neutral-400">
                  {group}
                </p>
                <div className="flex lg:flex-col gap-1">
                  {TABS.filter((t) => TAB_META[t].group === group).map((t) => {
                    const Icon = TAB_META[t].icon;
                    const active = tab === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setTab(t);
                          setQuery("");
                        }}
                        className={`group shrink-0 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                          active
                            ? "bg-brand/10 text-brand ring-1 ring-brand/20"
                            : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
                        }`}
                      >
                        <Icon className="size-3.5 shrink-0" />
                        <span className="flex-1 text-left">{t}</span>
                        {counts[t] !== undefined ? (
                          <span
                            className={`hidden lg:inline font-mono text-[10px] ${
                              active ? "text-brand" : "text-neutral-400"
                            }`}
                          >
                            {counts[t]}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="min-w-0">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-neutral-200/70 pb-4">
              <div>
                <h2 className="text-sm font-semibold">{tab}</h2>
                <p className="text-xs text-neutral-500 mt-0.5">{TAB_META[tab].blurb}</p>
              </div>
              {showSearch ? (
                <TextInput
                  placeholder={`Filter ${tab.toLowerCase()}…`}
                  aria-label={`Filter ${tab}`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="max-w-56 shrink-0"
                />
              ) : null}
            </div>

        {tab === "Overview" ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Estate at a glance" meta="live">
              <dl className="space-y-3 text-xs font-mono text-neutral-500">
                <Row k="Users" v={adminStats.users.toLocaleString()} />
                <Row k="Domains" v={adminStats.domains.toLocaleString()} />
                <Row k="Aliases" v={adminStats.aliases.toLocaleString()} />
                <Row k="Queue depth" v={adminStats.queueDepth.toLocaleString()} />
                <Row k="PGP deliveries" v={adminStats.pgpDeliveries.toLocaleString()} />
              </dl>
            </Panel>
            <Panel title="Latest admin actions" meta={`${auditLogs.length} events`}>
              <ol className="space-y-3">
                {auditLogs.slice(0, 5).map((l) => (
                  <li key={l.id} className="flex items-start gap-3">
                    <span className="mt-1.5 size-1.5 rounded-full bg-brand shrink-0" />
                    <div className="min-w-0">
                      <p className="font-mono text-xs truncate">{l.action}</p>
                      <p className="text-[11px] text-neutral-400">
                        {l.actor} · {formatDateTime(l.timestamp)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
          </div>
        ) : null}


        {tab === "Users" ? (
          <Panel title="Users" meta={`${users.length} accounts`} padded={false}>
            <Table
              head={
                <>
                  <Th>Email</Th>
                  <Th>Plan</Th>
                  <Th>Status</Th>
                  <Th align="right">Domains</Th>
                  <Th align="right">Aliases</Th>
                  <Th align="right">Action</Th>
                </>
              }
            >
              {users
                .filter((u) => !q || u.email.toLowerCase().includes(q))
                .map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2.5 font-mono text-xs">{u.email}</td>
                    <td className="px-4 py-2.5">
                      <SelectInput
                        aria-label={`Plan for ${u.email}`}
                        value={u.plan}
                        onChange={(e) =>
                          setUsers((prev) =>
                            prev.map((x) =>
                              x.id === u.id ? { ...x, plan: e.target.value as AccountPlan } : x,
                            ),
                          )
                        }
                        className="w-28 text-xs"
                      >
                        <option value="free">Free</option>
                        <option value="basic">Basic</option>
                        <option value="pro">Shield</option>
                      </SelectInput>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill tone={u.isActive ? "emerald" : "rose"}>
                        {u.isActive ? "Active" : "Suspended"}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{u.domainCount}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{u.aliasCount}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Btn
                        variant={u.isActive ? "danger" : "ghost"}
                        onClick={() =>
                          setUsers((prev) =>
                            prev.map((x) => (x.id === u.id ? { ...x, isActive: !x.isActive } : x)),
                          )
                        }
                      >
                        {u.isActive ? "Suspend" : "Unsuspend"}
                      </Btn>
                    </td>
                  </tr>
                ))}
            </Table>
          </Panel>
        ) : null}

        {tab === "Plans" ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              {planTiers.map((p) => (
                <div key={p.id} className="bg-neutral-50 ring-1 ring-black/5 rounded-xl p-5">
                  <p className="text-sm font-semibold">{p.name}</p>
                  <dl className="mt-3 space-y-1.5 text-xs font-mono text-neutral-500">
                    <Row k="Aliases" v={p.limits.maxAliases.toLocaleString()} />
                    <Row k="Domains" v={String(p.limits.maxDomains)} />
                    <Row k="Recipients" v={String(p.limits.maxRecipients)} />
                    <Row k="Forwards / mo" v={p.limits.monthlyForwards.toLocaleString()} />
                    <Row k="PGP" v={p.limits.pgpEnabled ? "yes" : "no"} />
                    <Row k="Custom outbound" v={p.limits.customOutboundProvider ? "yes" : "no"} />
                  </dl>
                </div>
              ))}
            </div>
            <Panel title="User subscriptions" meta={`${users.length} accounts`} padded={false}>
              <Table
                head={
                  <>
                    <Th>Email</Th>
                    <Th>Plan</Th>
                    <Th align="right">Domains</Th>
                    <Th align="right">Aliases</Th>
                    <Th align="right">Recipients</Th>
                    <Th align="right">Status</Th>
                  </>
                }
              >
                {users
                  .filter((u) => !q || u.email.toLowerCase().includes(q))
                  .map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-2.5 font-mono text-xs">{u.email}</td>
                      <td className="px-4 py-2.5 text-xs capitalize">{u.plan}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">{u.domainCount}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">{u.aliasCount}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">{u.recipientCount}</td>
                      <td className="px-4 py-2.5 text-right">
                        <StatusPill tone={u.isActive ? "emerald" : "rose"}>
                          {u.isActive ? "Active" : "Suspended"}
                        </StatusPill>
                      </td>
                    </tr>
                  ))}
              </Table>
            </Panel>
          </div>
        ) : null}

        {tab === "Domains" ? (
          <Panel title="Domains" meta={`${domains.length} registered`} padded={false}>
            <Table
              head={
                <>
                  <Th>Domain</Th>
                  <Th>Owner</Th>
                  <Th>Status</Th>
                  <Th align="right">Action</Th>
                </>
              }
            >
              {domains
                .filter((d) => !q || d.domain.includes(q) || d.ownerEmail.includes(q))
                .map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-2.5 font-mono text-xs">{d.domain}</td>
                    <td className="px-4 py-2.5 text-xs text-neutral-500">{d.ownerEmail}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill
                        tone={d.status === "verified" ? "emerald" : d.status === "pending" ? "amber" : "rose"}
                      >
                        {d.isActive ? d.status : "suspended"}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Btn
                        variant={d.isActive ? "danger" : "ghost"}
                        onClick={() =>
                          setDomains((prev) =>
                            prev.map((x) => (x.id === d.id ? { ...x, isActive: !x.isActive } : x)),
                          )
                        }
                      >
                        {d.isActive ? "Suspend" : "Unsuspend"}
                      </Btn>
                    </td>
                  </tr>
                ))}
            </Table>
          </Panel>
        ) : null}

        {tab === "Aliases" ? (
          <Panel title="Aliases" meta={`${aliases.length} shown`} padded={false}>
            <Table
              head={
                <>
                  <Th>Alias</Th>
                  <Th>Recipient</Th>
                  <Th>Status</Th>
                  <Th>PGP</Th>
                  <Th align="right">Actions</Th>
                </>
              }
            >
              {aliases
                .filter((a) => !q || `${a.localPart}@${a.domain}`.includes(q))
                .map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {a.localPart}@{a.domain}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-neutral-500">{a.recipientEmail}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill tone={a.status === "active" ? "emerald" : "neutral"}>
                        {a.status}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-neutral-500">{a.pgpMode}</td>
                    <td className="px-4 py-2.5 text-right space-x-2">
                      <Btn
                        onClick={() =>
                          setAliases((prev) =>
                            prev.map((x) =>
                              x.id === a.id
                                ? { ...x, status: x.status === "active" ? "disabled" : "active" }
                                : x,
                            ),
                          )
                        }
                      >
                        {a.status === "active" ? "Disable" : "Enable"}
                      </Btn>
                      <Btn
                        variant="danger"
                        onClick={() => setAliases((prev) => prev.filter((x) => x.id !== a.id))}
                      >
                        Delete
                      </Btn>
                    </td>
                  </tr>
                ))}
            </Table>
          </Panel>
        ) : null}

        {tab === "Reserved" ? (
          <ReservedTab list={reserved} setList={setReserved} query={q} />
        ) : null}

        {tab === "Deliveries" ? (
          <Panel title="Deliveries" meta={`${adminDeliveries.length} recent`} padded={false}>
            <Table
              head={
                <>
                  <Th>Alias</Th>
                  <Th>Recipient</Th>
                  <Th>Status</Th>
                  <Th>Reason</Th>
                  <Th align="right">When</Th>
                </>
              }
            >
              {adminDeliveries
                .filter((d) => !q || d.alias.includes(q) || d.recipient.includes(q))
                .map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-2.5 font-mono text-xs">{d.alias}</td>
                    <td className="px-4 py-2.5 text-xs text-neutral-500">{d.recipient}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill
                        tone={
                          d.status === "delivered" ? "emerald" : d.status === "failed" ? "rose" : "neutral"
                        }
                      >
                        {d.status}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-neutral-600">
                      {DELIVERY_ERROR_LABELS[d.reasonCode] ?? d.reasonCode}
                      <span className="block text-[11px] font-mono text-neutral-400">
                        pgp: {d.pgpMode}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-mono text-neutral-500">
                      {formatDateTime(d.createdAt)}
                    </td>
                  </tr>
                ))}
            </Table>
          </Panel>
        ) : null}

        {tab === "Audit Logs" ? (
          <Panel title="Audit logs" meta={`${auditLogs.length} events`} padded={false}>
            <Table
              head={
                <>
                  <Th>Action</Th>
                  <Th>Target type</Th>
                  <Th>Target ID</Th>
                  <Th>Actor</Th>
                  <Th align="right">Timestamp</Th>
                </>
              }
            >
              {auditLogs
                .filter((l) => !q || l.action.includes(q) || l.actor.includes(q))
                .map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2.5 font-mono text-xs">{l.action}</td>
                    <td className="px-4 py-2.5 text-xs text-neutral-500">{l.targetType}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-neutral-400">{l.targetId}</td>
                    <td className="px-4 py-2.5 text-xs text-neutral-500">{l.actor}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-mono text-neutral-500">
                      {formatDateTime(l.timestamp)}
                    </td>
                  </tr>
                ))}
            </Table>
          </Panel>
        ) : null}
        </div>
        </div>
      </div>
    </AppShell>

  );
}

function ReservedTab({
  list,
  setList,
  query,
}: {
  list: ReservedLocalPart[];
  setList: React.Dispatch<React.SetStateAction<ReservedLocalPart[]>>;
  query: string;
}) {
  const [localPart, setLocalPart] = useState("");
  const [domain, setDomain] = useState("");
  const [action, setAction] = useState<"reserve" | "allow">("reserve");
  const [note, setNote] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(
    () => list.filter((r) => !query || r.localPart.includes(query)),
    [list, query],
  );
  const pageSize = 4;
  const rows = filtered.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <div className="space-y-6">
      <Panel title="Add rule">
        <div className="grid gap-3 md:grid-cols-5 items-end">
          <Field label="Local-part">
            <TextInput value={localPart} onChange={(e) => setLocalPart(e.target.value)} />
          </Field>
          <Field label="Domain">
            <TextInput
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="optional"
            />
          </Field>
          <Field label="Action">
            <SelectInput
              value={action}
              onChange={(e) => setAction(e.target.value as "reserve" | "allow")}
            >
              <option value="reserve">Reserve</option>
              <option value="allow">Allow</option>
            </SelectInput>
          </Field>
          <Field label="Note">
            <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Btn
            variant="primary"
            disabled={!localPart.trim()}
            className="py-2 justify-center"
            onClick={() => {
              setList((prev) => [
                {
                  id: `res_${Math.random().toString(36).slice(2, 7)}`,
                  localPart: localPart.trim(),
                  domain: domain.trim() || null,
                  action,
                  note: note.trim() || "Manual entry",
                  sourceBatch: null,
                },
                ...prev,
              ]);
              setLocalPart("");
              setDomain("");
              setNote("");
            }}
          >
            Add rule
          </Btn>
        </div>
      </Panel>

      <Panel
        title="Reserved local-parts"
        meta={`${rows.length} of ${filtered.length}`}
        padded={false}
      >
        <Table
          head={
            <>
              <Th>Local-part</Th>
              <Th>Scope</Th>
              <Th>Action</Th>
              <Th>Source</Th>
              <Th>Note</Th>
              <Th align="right"> </Th>
            </>
          }
        >
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2.5 font-mono text-xs">{r.localPart}</td>
              <td className="px-4 py-2.5 text-xs text-neutral-500">{r.domain ?? "Global"}</td>
              <td className="px-4 py-2.5">
                <StatusPill tone={r.action === "reserve" ? "rose" : "emerald"}>
                  {r.action}
                </StatusPill>
              </td>
              <td className="px-4 py-2.5 text-xs font-mono text-neutral-400">
                {r.sourceBatch ?? "Manual"}
              </td>
              <td className="px-4 py-2.5 text-xs text-neutral-500">{r.note}</td>
              <td className="px-4 py-2.5 text-right">
                <Btn
                  variant="danger"
                  onClick={() => setList((prev) => prev.filter((x) => x.id !== r.id))}
                >
                  Delete
                </Btn>
              </td>
            </tr>
          ))}
        </Table>
        <div className="px-4 py-2.5 border-t border-neutral-200/60 flex items-center justify-end gap-2">
          <Btn disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Btn>
          <Btn
            disabled={(page + 1) * pageSize >= filtered.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Btn>
        </div>
      </Panel>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "amber" | "emerald";
}) {
  const dot =
    tone === "amber" ? "bg-amber-500" : tone === "emerald" ? "bg-emerald-500" : "bg-neutral-300";
  return (
    <div className="px-6 py-4">
      <div className="flex items-center gap-1.5">
        <span className={`size-1.5 rounded-full ${dot}`} />
        <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">{label}</p>
      </div>
      <p className="mt-1 font-mono text-xl tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

function Tile({
  label,
  value,
  small,
}: {
  label: string;
  value: string | number;
  small?: boolean;
}) {
  return (
    <div className="bg-neutral-50 ring-1 ring-black/5 rounded-xl p-4">
      <p className="text-[11px] font-medium text-neutral-400 uppercase">{label}</p>
      <p className={`mt-1 font-mono ${small ? "text-sm" : "text-xl"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{k}</span>
      <span className="text-neutral-900">{v}</span>
    </div>
  );
}
