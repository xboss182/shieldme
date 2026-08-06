import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  adminApi,
  DELIVERY_ERROR_LABELS,
  formatDateTime,
  usePlanTiers,
  type AccountPlan,
  type AdminAlias,
  type AdminDelivery,
  type AdminDomain,
  type AdminReserved,
  type AdminUser,
  type AuditLog,
} from "@/lib/api";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Console — ShieldMail" },
      {
        name: "description",
        content: "Platform administration for ShieldMail users, domains, aliases, and delivery.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Admin Console — ShieldMail" },
      {
        property: "og:description",
        content: "Platform administration for ShieldMail users, domains, aliases, and delivery.",
      },
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
  Overview: {
    icon: CircleGauge,
    group: "Platform",
    blurb: "Live counters across the whole estate.",
  },
  Users: { icon: Users, group: "Directory", blurb: "Accounts, plan assignment, and suspension." },
  Plans: {
    icon: Activity,
    group: "Directory",
    blurb: "Tier limits and per-account subscriptions.",
  },
  Domains: { icon: Globe, group: "Directory", blurb: "Registered domains and verification state." },
  Aliases: { icon: Inbox, group: "Directory", blurb: "Every alias on the platform." },
  Reserved: { icon: Lock, group: "Directory", blurb: "Reserve or allow specific local-parts." },
  Deliveries: { icon: Send, group: "Delivery", blurb: "Forwarding outcomes and failure reasons." },
  "Audit Logs": { icon: ScrollText, group: "Delivery", blurb: "Immutable trail of admin actions." },
};

const GROUPS = ["Platform", "Directory", "Delivery"] as const;

const SECRET_KEY = "sm.admin";
const ADMIN = (secret: string) => ({ authorization: secret });

function AdminPage() {
  const [tab, setTab] = useState<Tab>("Overview");
  const [query, setQuery] = useState("");
  const [secret, setSecret] = useState(() => {
    if (typeof localStorage === "undefined") return "";
    return localStorage.getItem(SECRET_KEY) ?? "";
  });
  const [secretSaved, setSecretSaved] = useState(Boolean(secret));
  const qc = useQueryClient();

  const token = secret.trim();
  const authed = Boolean(token);

  const stats = useQuery({
    queryKey: ["admin-stats", token],
    enabled: authed,
    queryFn: () => adminApi.get<AdminStats>("/stats", token),
  });
  const users = useQuery({
    queryKey: ["admin-users", token],
    enabled: authed,
    queryFn: () =>
      adminApi.get<{ users: AdminUser[] }>("/users?limit=100", token).then((r) => r.users),
  });
  const domains = useQuery({
    queryKey: ["admin-domains", token],
    enabled: authed,
    queryFn: () =>
      adminApi.get<{ domains: AdminDomain[] }>("/domains?limit=100", token).then((r) => r.domains),
  });
  const aliases = useQuery({
    queryKey: ["admin-aliases", token],
    enabled: authed,
    queryFn: () =>
      adminApi.get<{ aliases: AdminAlias[] }>("/aliases?limit=100", token).then((r) => r.aliases),
  });
  const reserved = useQuery({
    queryKey: ["admin-reserved", token],
    enabled: authed,
    queryFn: () =>
      adminApi
        .get<{ reservedLocalParts: AdminReserved[] }>("/reserved-local-parts?limit=100", token)
        .then((r) => r.reservedLocalParts),
  });
  const deliveries = useQuery({
    queryKey: ["admin-deliveries", token],
    enabled: authed,
    queryFn: () =>
      adminApi
        .get<{ deliveries: AdminDelivery[] }>("/deliveries?limit=100", token)
        .then((r) => r.deliveries),
  });
  const audit = useQuery({
    queryKey: ["admin-audit", token],
    enabled: authed,
    queryFn: () =>
      adminApi
        .get<{ auditLogs: AuditLog[] }>("/audit-logs?limit=100", token)
        .then((r) => r.auditLogs),
  });
  const { data: limitMap } = usePlanTiers();

  const adminError = [stats, users, domains, aliases, reserved, deliveries, audit]
    .map((q) => q.error)
    .find((e): e is Error => Boolean(e));
  const adminLoading = [stats, users, domains, aliases, reserved, deliveries, audit].some(
    (q) => q.isLoading,
  );

  const q = query.trim().toLowerCase();
  const showSearch = tab !== "Overview";

  const counts: Partial<Record<Tab, number>> = {
    Users: users.data?.length,
    Domains: domains.data?.length,
    Aliases: aliases.data?.length,
    Reserved: reserved.data?.length,
    Deliveries: deliveries.data?.length,
    "Audit Logs": audit.data?.length,
    Plans: limitMap ? Object.keys(limitMap).length : undefined,
  };

  const invalidate = (keys: string[]) => {
    for (const k of keys) void qc.invalidateQueries({ queryKey: [k, token] });
  };

  const setUserPlan = useMutation({
    mutationFn: ({ id, plan }: { id: string; plan: string }) =>
      adminApi.patch(`/users/${id}`, token, { plan }),
    onSettled: () => invalidate(["admin-users"]),
  });
  const toggleUser = useMutation({
    mutationFn: ({ id, enable }: { id: string; enable: boolean }) =>
      adminApi.post(`/users/${id}/${enable ? "enable" : "disable"}`, token),
    onSettled: () => invalidate(["admin-users"]),
  });
  const toggleDomain = useMutation({
    mutationFn: ({ id, enable }: { id: string; enable: boolean }) =>
      adminApi.post(`/domains/${id}/${enable ? "enable" : "disable"}`, token),
    onSettled: () => invalidate(["admin-domains"]),
  });
  const toggleAlias = useMutation({
    mutationFn: ({ id, enable }: { id: string; enable: boolean }) =>
      adminApi.post(`/aliases/${id}/${enable ? "enable" : "disable"}`, token),
    onSettled: () => invalidate(["admin-aliases"]),
  });
  const deleteAlias = useMutation({
    mutationFn: (id: string) => adminApi.del(`/aliases/${id}`, token, { confirm: "DELETE" }),
    onSettled: () => invalidate(["admin-aliases"]),
  });
  const addReserved = useMutation({
    mutationFn: (body: {
      localPart: string;
      domainId?: string | null;
      action: "reserve" | "allow";
      note?: string;
    }) => adminApi.post("/reserved-local-parts", token, body),
    onSettled: () => invalidate(["admin-reserved"]),
  });
  const deleteReserved = useMutation({
    mutationFn: (id: string) => adminApi.del(`/reserved-local-parts/${id}`, token),
    onSettled: () => invalidate(["admin-reserved"]),
  });

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
                placeholder={authed ? "••••••••" : "ADMIN_SECRET"}
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
                onClick={() => {
                  if (typeof localStorage !== "undefined") {
                    if (secret.trim()) localStorage.setItem(SECRET_KEY, secret.trim());
                    else localStorage.removeItem(SECRET_KEY);
                  }
                  setSecretSaved(Boolean(secret.trim()));
                }}
              >
                {secretSaved ? "Unlocked" : "Unlock"}
              </Btn>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-neutral-200/60 border-t border-neutral-200/60">
            <Stat label="Users" value={stats.data?.totals?.users ?? 0} />
            <Stat label="Domains" value={stats.data?.totals?.domains ?? 0} />
            <Stat label="Aliases" value={stats.data?.totals?.aliases ?? 0} />
            <Stat label="Queue depth" value={stats.data?.queue?.depth ?? 0} tone="amber" />
            <Stat
              label="PGP deliveries"
              value={stats.data?.pgpEncryptedDeliveries ?? 0}
              tone="emerald"
            />
          </div>
        </div>

        {!authed ? (
          <Panel>
            <p className="py-10 text-center text-sm text-neutral-500">
              Enter the admin secret above to unlock platform administration.
            </p>
          </Panel>
        ) : adminError ? (
          <Panel>
            <p className="py-10 text-center text-sm text-rose-600">
              Admin API error: {adminError.message}
            </p>
          </Panel>
        ) : adminLoading ? (
          <Panel>
            <p className="py-10 text-center text-sm text-neutral-400">Loading admin data…</p>
          </Panel>
        ) : (
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
                <OverviewTab stats={stats.data} audit={audit.data ?? []} />
              ) : null}
              {tab === "Users" ? (
                <UsersTab
                  users={users.data ?? []}
                  q={q}
                  onPlan={setUserPlan.mutate}
                  onToggle={toggleUser.mutate}
                />
              ) : null}
              {tab === "Plans" ? <PlansTab limitMap={limitMap} /> : null}
              {tab === "Domains" ? (
                <DomainsTab domains={domains.data ?? []} q={q} onToggle={toggleDomain.mutate} />
              ) : null}
              {tab === "Aliases" ? (
                <AliasesTab
                  aliases={aliases.data ?? []}
                  q={q}
                  onToggle={toggleAlias.mutate}
                  onDelete={deleteAlias.mutate}
                />
              ) : null}
              {tab === "Reserved" ? (
                <ReservedTab
                  list={reserved.data ?? []}
                  q={q}
                  onAdd={addReserved.mutate}
                  onDelete={deleteReserved.mutate}
                />
              ) : null}
              {tab === "Deliveries" ? (
                <DeliveriesTab deliveries={deliveries.data ?? []} q={q} />
              ) : null}
              {tab === "Audit Logs" ? <AuditTab logs={audit.data ?? []} q={q} /> : null}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

type AdminStats = {
  totals: { users: number; domains: number; recipients: number; aliases: number };
  queue?: { depth: number };
  pgpEncryptedDeliveries?: number;
};

function OverviewTab({ stats, audit }: { stats?: AdminStats; audit: AuditLog[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Estate at a glance" meta="live">
        <dl className="space-y-3 text-xs font-mono text-neutral-500">
          <Row k="Users" v={(stats?.totals?.users ?? 0).toLocaleString()} />
          <Row k="Domains" v={(stats?.totals?.domains ?? 0).toLocaleString()} />
          <Row k="Recipients" v={(stats?.totals?.recipients ?? 0).toLocaleString()} />
          <Row k="Aliases" v={(stats?.totals?.aliases ?? 0).toLocaleString()} />
        </dl>
      </Panel>
      <Panel title="Latest admin actions" meta={`${audit.length} events`}>
        <ol className="space-y-3">
          {audit.slice(0, 5).map((l) => (
            <li key={l.id} className="flex items-start gap-3">
              <span className="mt-1.5 size-1.5 rounded-full bg-brand shrink-0" />
              <div className="min-w-0">
                <p className="font-mono text-xs truncate">{l.action}</p>
                <p className="text-[11px] text-neutral-400">
                  {l.actor} · {formatDateTime(l.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}

function UsersTab({
  users,
  q,
  onPlan,
  onToggle,
}: {
  users: AdminUser[];
  q: string;
  onPlan: (a: { id: string; plan: string }) => void;
  onToggle: (a: { id: string; enable: boolean }) => void;
}) {
  const rows = users.filter((u) => !q || u.email.toLowerCase().includes(q));
  return (
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
        {rows.map((u) => (
          <tr key={u.id}>
            <td className="px-4 py-2.5 font-mono text-xs">{u.email}</td>
            <td className="px-4 py-2.5">
              <SelectInput
                aria-label={`Plan for ${u.email}`}
                value={u.plan}
                onChange={(e) => onPlan({ id: u.id, plan: e.target.value })}
                className="w-28 text-xs"
              >
                <option value="free">Free</option>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="business">Business</option>
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
                onClick={() => onToggle({ id: u.id, enable: !u.isActive })}
              >
                {u.isActive ? "Suspend" : "Unsuspend"}
              </Btn>
            </td>
          </tr>
        ))}
      </Table>
    </Panel>
  );
}

function PlansTab({
  limitMap,
}: {
  limitMap?: Record<
    AccountPlan,
    {
      maxAliases: number;
      maxDomains: number;
      maxRecipients: number;
      monthlyForwards: number;
      pgpEnabled: boolean;
      customOutboundProvider: boolean;
    }
  >;
}) {
  const plans = limitMap
    ? (Object.entries(limitMap) as [AccountPlan, (typeof limitMap)[AccountPlan]][])
    : [];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map(([id, p]) => (
          <div key={id} className="bg-neutral-50 ring-1 ring-black/5 rounded-xl p-5">
            <p className="text-sm font-semibold capitalize">{id}</p>
            <dl className="mt-3 space-y-1.5 text-xs font-mono text-neutral-500">
              <Row k="Aliases" v={p.maxAliases.toLocaleString()} />
              <Row k="Domains" v={String(p.maxDomains)} />
              <Row k="Recipients" v={String(p.maxRecipients)} />
              <Row k="Forwards / mo" v={p.monthlyForwards.toLocaleString()} />
              <Row k="PGP" v={p.pgpEnabled ? "yes" : "no"} />
              <Row k="Custom outbound" v={p.customOutboundProvider ? "yes" : "no"} />
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

function DomainsTab({
  domains,
  q,
  onToggle,
}: {
  domains: AdminDomain[];
  q: string;
  onToggle: (a: { id: string; enable: boolean }) => void;
}) {
  const rows = domains.filter(
    (d) => !q || d.domain.includes(q) || (d.ownerEmail ?? "").includes(q),
  );
  return (
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
        {rows.map((d) => (
          <tr key={d.id}>
            <td className="px-4 py-2.5 font-mono text-xs">{d.domain}</td>
            <td className="px-4 py-2.5 text-xs text-neutral-500">{d.ownerEmail ?? "—"}</td>
            <td className="px-4 py-2.5">
              <StatusPill tone={d.isActive ? "emerald" : "rose"}>
                {d.isActive ? d.status : "suspended"}
              </StatusPill>
            </td>
            <td className="px-4 py-2.5 text-right">
              <Btn
                variant={d.isActive ? "danger" : "ghost"}
                onClick={() => onToggle({ id: d.id, enable: !d.isActive })}
              >
                {d.isActive ? "Suspend" : "Unsuspend"}
              </Btn>
            </td>
          </tr>
        ))}
      </Table>
    </Panel>
  );
}

function AliasesTab({
  aliases,
  q,
  onToggle,
  onDelete,
}: {
  aliases: AdminAlias[];
  q: string;
  onToggle: (a: { id: string; enable: boolean }) => void;
  onDelete: (id: string) => void;
}) {
  const rows = aliases.filter((a) => !q || `${a.localPart}@${a.domain}`.includes(q));
  return (
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
        {rows.map((a) => (
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
              <Btn onClick={() => onToggle({ id: a.id, enable: a.status !== "active" })}>
                {a.status === "active" ? "Disable" : "Enable"}
              </Btn>
              <Btn variant="danger" onClick={() => onDelete(a.id)}>
                Delete
              </Btn>
            </td>
          </tr>
        ))}
      </Table>
    </Panel>
  );
}

function ReservedTab({
  list,
  q,
  onAdd,
  onDelete,
}: {
  list: AdminReserved[];
  q: string;
  onAdd: (b: { localPart: string; action: "reserve" | "allow"; note?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [localPart, setLocalPart] = useState("");
  const [action, setAction] = useState<"reserve" | "allow">("reserve");
  const [note, setNote] = useState("");

  const rows = list.filter((r) => !q || r.localPart.includes(q));

  return (
    <div className="space-y-6">
      <Panel title="Add rule">
        <div className="grid gap-3 md:grid-cols-4 items-end">
          <Field label="Local-part">
            <TextInput value={localPart} onChange={(e) => setLocalPart(e.target.value)} />
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
              onAdd({ localPart: localPart.trim(), action, note: note.trim() || undefined });
              setLocalPart("");
              setNote("");
            }}
          >
            Add rule
          </Btn>
        </div>
      </Panel>

      <Panel title="Reserved local-parts" meta={`${rows.length} rules`} padded={false}>
        <Table
          head={
            <>
              <Th>Local-part</Th>
              <Th>Scope</Th>
              <Th>Action</Th>
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
              <td className="px-4 py-2.5 text-xs text-neutral-500">{r.note}</td>
              <td className="px-4 py-2.5 text-right">
                <Btn variant="danger" onClick={() => onDelete(r.id)}>
                  Delete
                </Btn>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}

function DeliveriesTab({ deliveries, q }: { deliveries: AdminDelivery[]; q: string }) {
  const rows = deliveries.filter((d) => !q || d.alias.includes(q) || d.recipient.includes(q));
  return (
    <Panel title="Deliveries" meta={`${deliveries.length} recent`} padded={false}>
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
        {rows.map((d) => (
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
              {DELIVERY_ERROR_LABELS[d.failureType] ?? d.failureType ?? "—"}
            </td>
            <td className="px-4 py-2.5 text-right text-xs font-mono text-neutral-500">
              {formatDateTime(d.createdAt)}
            </td>
          </tr>
        ))}
      </Table>
    </Panel>
  );
}

function AuditTab({ logs, q }: { logs: AuditLog[]; q: string }) {
  const rows = logs.filter((l) => !q || l.action.includes(q) || l.actor.includes(q));
  return (
    <Panel title="Audit logs" meta={`${logs.length} events`} padded={false}>
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
        {rows.map((l) => (
          <tr key={l.id}>
            <td className="px-4 py-2.5 font-mono text-xs">{l.action}</td>
            <td className="px-4 py-2.5 text-xs text-neutral-500">{l.targetType}</td>
            <td className="px-4 py-2.5 font-mono text-xs text-neutral-400">{l.targetId}</td>
            <td className="px-4 py-2.5 text-xs text-neutral-500">{l.actor}</td>
            <td className="px-4 py-2.5 text-right text-xs font-mono text-neutral-500">
              {formatDateTime(l.createdAt)}
            </td>
          </tr>
        ))}
      </Table>
    </Panel>
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{k}</span>
      <span className="text-neutral-900">{v}</span>
    </div>
  );
}
