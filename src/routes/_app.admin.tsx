import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  adminApi,
  plansApi,
  ApiError,
  type AccountPlan,
  type PlanLimits,
  type AdminAlias,
  type AdminAuditLog,
  type AdminConfig,
  type AdminDelivery,
  type AdminDomain,
  type AdminStats,
  type AdminUser,
  type ReservedLocalPart,
} from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { useAuth } from "../lib/auth";
import { Badge } from "../components/ui/badge";
import { CheckCircle2, ShieldAlert, XCircle } from "lucide-react";

export const Route = createFileRoute("/_app/admin")({ component: AdminPage });

type Tab =
  | "overview"
  | "users"
  | "plans"
  | "domains"
  | "aliases"
  | "reserved"
  | "deliveries"
  | "audit"
  | "config";
const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "plans", label: "Plans" },
  { id: "domains", label: "Domains" },
  { id: "aliases", label: "Aliases" },
  { id: "reserved", label: "Reserved" },
  { id: "deliveries", label: "Deliveries" },
  { id: "audit", label: "Audit Logs" },
  { id: "config", label: "Config" },
];

function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [secret, setSecret] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem("sm_admin_secret") ?? "") : "",
  );
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const auth = useMemo(() => secret.trim() || undefined, [secret]);

  if (user?.role !== "admin") {
    return (
      <Card className="max-w-md border-border bg-card-grad shadow-card">
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>Admin role required.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const saveSecret = () => {
    localStorage.setItem("sm_admin_secret", secret);
    setError("");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Admin Operations</h1>
          <p className="text-muted-foreground">
            Manage users, domains, aliases, delivery metadata, and audit logs.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder="ADMIN_SECRET"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="w-56"
          />
          <Button onClick={saveSecret}>Save secret</Button>
        </div>
      </div>
      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button
            key={t.id}
            variant={tab === t.id ? "default" : "outline"}
            onClick={() => {
              setError("");
              setTab(t.id);
            }}
          >
            {t.label}
          </Button>
        ))}
      </div>
      {tab !== "overview" && tab !== "config" && (
        <Input
          placeholder="Search/filter"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      )}
      {tab === "overview" && <Overview secret={auth} onError={setError} />}
      {tab === "users" && <Users secret={auth} search={search} onError={setError} />}
      {tab === "plans" && <PlansAdmin secret={auth} search={search} onError={setError} />}
      {tab === "domains" && <Domains secret={auth} search={search} onError={setError} />}
      {tab === "aliases" && <Aliases secret={auth} search={search} onError={setError} />}
      {tab === "reserved" && <ReservedAliases secret={auth} search={search} onError={setError} />}
      {tab === "deliveries" && <Deliveries secret={auth} search={search} onError={setError} />}
      {tab === "audit" && <AuditLogs secret={auth} search={search} onError={setError} />}
      {tab === "config" && <ConfigPanel />}
    </div>
  );
}

function useAdminData<T>(
  loader: () => Promise<T>,
  deps: unknown[],
  onError: (msg: string) => void,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    loader()
      .then(setData)
      .catch((e) => onError(e instanceof ApiError ? e.message : "Admin request failed"))
      .finally(() => setLoading(false));
    // The callers provide the explicit request dependencies; loader/onError are render-local closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return {
    data,
    loading,
    reload: () =>
      loader()
        .then(setData)
        .catch((e) => onError(e instanceof ApiError ? e.message : "Admin request failed")),
  };
}

function Overview({ secret, onError }: { secret?: string; onError: (m: string) => void }) {
  const { data, loading } = useAdminData<AdminStats>(
    () => adminApi.stats(secret),
    [secret],
    onError,
  );
  if (loading) return <p>Loading stats...</p>;
  if (!data) return null;
  const cards = [
    { k: "Users", v: data.totals?.users ?? data.users?.total ?? 0 },
    { k: "Domains", v: data.totals?.domains ?? data.domains?.total ?? 0 },
    { k: "Aliases", v: data.totals?.aliases ?? data.aliases?.total ?? 0 },
    {
      k: "Queue",
      v: typeof data.queueDepth === "number" ? data.queueDepth : (data.queue?.depth ?? 0),
    },
    { k: "PGP deliveries", v: data.pgpEncryptedDeliveries ?? data.deliveries?.pgpEncrypted ?? 0 },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
      {cards.map((c) => (
        <Card key={c.k} className="border-border bg-card-grad shadow-card">
          <CardHeader>
            <CardDescription>{c.k}</CardDescription>
            <CardTitle>{c.v}</CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

function Users({
  secret,
  search,
  onError,
}: {
  secret?: string;
  search: string;
  onError: (m: string) => void;
}) {
  const { data, loading, reload } = useAdminData<{ users: AdminUser[] }>(
    () => adminApi.users(search, secret),
    [search, secret],
    onError,
  );
  return (
    <TableCard
      title="Users"
      headers={["Email", "Plan", "Status", "Domains", "Aliases", "Action"]}
      loading={loading}
      rows={data?.users ?? []}
      render={(u: AdminUser) => (
        <>
          <td>{u.email}</td>
          <td>
            <select
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
              value={u.plan ?? "free"}
              onChange={(e) =>
                adminApi.setUserPlan(u.id, e.target.value as AccountPlan, secret).then(reload)
              }
            >
              <option value="free">Free</option>
              <option value="basic">Basic</option>
              <option value="pro">Shield</option>
            </select>
          </td>
          <td>
            <Status active={u.isActive} />
          </td>
          <td>{u.domainCount ?? "-"}</td>
          <td>{u.aliasCount ?? "-"}</td>
          <td>
            <Button
              size="sm"
              onClick={() =>
                adminApi
                  .setUserStatus(u.id, u.isActive ? "suspended" : "active", secret)
                  .then(reload)
              }
            >
              {u.isActive ? "Suspend" : "Unsuspend"}
            </Button>
          </td>
        </>
      )}
    />
  );
}

function PlansAdmin({
  secret,
  search,
  onError,
}: {
  secret?: string;
  search: string;
  onError: (m: string) => void;
}) {
  const [tiers, setTiers] = useState<Record<AccountPlan, PlanLimits> | null>(null);
  const { data, loading, reload } = useAdminData<{ users: AdminUser[] }>(
    () => adminApi.users(search, secret),
    [search, secret],
    onError,
  );
  useEffect(() => {
    plansApi
      .tiers()
      .then((r) => setTiers(r.plans))
      .catch(() => onError("Could not load plan tiers"));
  }, [onError]);
  const order: AccountPlan[] = ["free", "basic", "pro"];
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        {tiers &&
          order.map((plan) => {
            const l = tiers[plan];
            return (
              <Card key={plan} className="border-border bg-card-grad shadow-card">
                <CardHeader>
                  <CardTitle>
                    {plan === "pro" ? "Shield" : plan[0].toUpperCase() + plan.slice(1)}
                  </CardTitle>
                  <CardDescription>
                    {l.maxAliases} aliases · {l.maxDomains} domains
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <div>{l.maxRecipients} recipients</div>
                  <div>{l.monthlyForwards.toLocaleString()} monthly forwards</div>
                  <div>PGP: {l.pgpEnabled ? "included" : "not included"}</div>
                  <div>
                    Custom outbound: {l.customOutboundProvider ? "included" : "not included"}
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>
      <TableCard
        title="User subscriptions"
        headers={["Email", "Plan", "Domains", "Aliases", "Recipients", "Status"]}
        loading={loading}
        rows={data?.users ?? []}
        render={(u: AdminUser) => (
          <>
            <td>{u.email}</td>
            <td>
              <select
                className="rounded-md border border-input bg-background px-2 py-1 text-xs capitalize"
                value={u.plan ?? "free"}
                onChange={(e) =>
                  adminApi.setUserPlan(u.id, e.target.value as AccountPlan, secret).then(reload)
                }
              >
                {order.map((plan) => (
                  <option key={plan} value={plan}>
                    {plan === "pro" ? "Shield" : plan[0].toUpperCase() + plan.slice(1)}
                  </option>
                ))}
              </select>
            </td>
            <td>{u.domainCount ?? "-"}</td>
            <td>{u.aliasCount ?? "-"}</td>
            <td>{u.recipientCount ?? "-"}</td>
            <td>
              <Status active={u.isActive} />
            </td>
          </>
        )}
      />
    </div>
  );
}

function Domains({
  secret,
  search,
  onError,
}: {
  secret?: string;
  search: string;
  onError: (m: string) => void;
}) {
  const { data, loading, reload } = useAdminData<{ domains: AdminDomain[] }>(
    () => adminApi.domains(search, secret),
    [search, secret],
    onError,
  );
  return (
    <TableCard
      title="Domains"
      headers={["Domain", "Owner", "Active", "Status", "Action"]}
      loading={loading}
      rows={data?.domains ?? []}
      render={(d: AdminDomain) => (
        <>
          <td>{d.domain}</td>
          <td>{d.ownerEmail}</td>
          <td>
            <Status active={d.isActive} />
          </td>
          <td>{d.status}</td>
          <td>
            <Button
              size="sm"
              onClick={() =>
                adminApi
                  .setDomainStatus(d.id, d.isActive ? "suspended" : "active", secret)
                  .then(reload)
              }
            >
              {d.isActive ? "Suspend" : "Unsuspend"}
            </Button>
          </td>
        </>
      )}
    />
  );
}
function Aliases({
  secret,
  search,
  onError,
}: {
  secret?: string;
  search: string;
  onError: (m: string) => void;
}) {
  const { data, loading, reload } = useAdminData<{ aliases: AdminAlias[] }>(
    () => adminApi.aliases(search, secret),
    [search, secret],
    onError,
  );
  return (
    <TableCard
      title="Aliases"
      headers={["Alias", "Recipient", "Status", "PGP mode", "Action"]}
      loading={loading}
      rows={data?.aliases ?? []}
      render={(a: AdminAlias) => (
        <>
          <td>
            {a.localPart}@{a.domain}
          </td>
          <td>{a.recipientEmail}</td>
          <td>{a.status}</td>
          <td>{a.pgpMode}</td>
          <td className="space-x-2">
            <Button
              size="sm"
              onClick={() =>
                adminApi
                  .setAliasStatus(a.id, a.status === "active" ? "disabled" : "active", secret)
                  .then(reload)
              }
            >
              {a.status === "active" ? "Disable" : "Enable"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => adminApi.deleteAlias(a.id, secret).then(reload)}
            >
              Delete
            </Button>
          </td>
        </>
      )}
    />
  );
}

function ReservedAliases({
  secret,
  search,
  onError,
}: {
  secret?: string;
  search: string;
  onError: (m: string) => void;
}) {
  const { data, loading, reload } = useAdminData<{ reservedLocalParts: ReservedLocalPart[] }>(
    () => adminApi.reservedLocalParts(search, secret),
    [search, secret],
    onError,
  );
  const [localPart, setLocalPart] = useState("");
  const [domainId, setDomainId] = useState("");
  const [action, setAction] = useState<"reserve" | "allow">("reserve");
  const [note, setNote] = useState("");
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    await adminApi.createReservedLocalPart(
      { localPart, domainId: domainId.trim() || null, action, note: note.trim() || null },
      secret,
    );
    setLocalPart("");
    setDomainId("");
    setNote("");
    reload();
  };
  return (
    <div className="space-y-4">
      <Card className="border-border bg-card-grad shadow-card">
        <CardHeader>
          <CardTitle>Reserved aliases</CardTitle>
          <CardDescription>
            Reserve risky names globally, or allow a reserved name for one domain by domain ID.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid gap-3 md:grid-cols-5">
            <Input
              placeholder="local-part e.g. security"
              value={localPart}
              onChange={(e) => setLocalPart(e.target.value)}
            />
            <Input
              placeholder="domain ID optional"
              value={domainId}
              onChange={(e) => setDomainId(e.target.value)}
            />
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={action}
              onChange={(e) => setAction(e.target.value as "reserve" | "allow")}
            >
              <option value="reserve">Reserve/block</option>
              <option value="allow">Allow override</option>
            </select>
            <Input
              placeholder="note optional"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button disabled={!localPart.trim()}>Add rule</Button>
          </form>
        </CardContent>
      </Card>
      <TableCard
        title="Reserved rules"
        headers={["Local-part", "Scope", "Action", "Note", "Action"]}
        loading={loading}
        rows={data?.reservedLocalParts ?? []}
        render={(r: ReservedLocalPart) => (
          <>
            <td>{r.localPart}</td>
            <td>{r.domain ?? r.domainId ?? "Global"}</td>
            <td>
              <Badge variant={r.action === "allow" ? "outline" : "secondary"}>{r.action}</Badge>
            </td>
            <td>{r.note ?? "—"}</td>
            <td>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => adminApi.deleteReservedLocalPart(r.id, secret).then(reload)}
              >
                Delete
              </Button>
            </td>
          </>
        )}
      />
    </div>
  );
}

const DELIVERY_ERROR_LABELS: Record<string, string> = {
  loop_sender: "Loop prevented — sender is a ShieldMail/platform address",
  auto_submitted: "Auto-reply prevented",
  precedence_bulk: "Bulk/list auto-mail prevented",
  list_id: "Mailing-list loop prevented",
  forwarding_disabled: "Forwarding disabled",
  alias_not_found: "Alias not found",
  alias_disabled: "Alias disabled",
  alias_deleted: "Alias deleted",
  recipient_unverified: "Recipient not verified",
  recipient_suppressed: "Recipient suppressed",
  sender_blocked: "Sender blocked",
  rate_limited: "Rate limited",
  plan_limit_exceeded: "Plan limit reached",
  pgp_key_required: "PGP key required",
  pgp_encryption_failed: "PGP encryption failed",
};
function deliveryErrorLabel(reason?: string | null) {
  if (!reason) return "—";
  return DELIVERY_ERROR_LABELS[reason] ?? reason.replace(/_/g, " ");
}
function Deliveries({
  secret,
  search,
  onError,
}: {
  secret?: string;
  search: string;
  onError: (m: string) => void;
}) {
  const { data, loading } = useAdminData<{ deliveries: AdminDelivery[] }>(
    () => adminApi.deliveries(search, secret),
    [search, secret],
    onError,
  );
  return (
    <TableCard
      title="Deliveries"
      headers={["Alias", "Recipient", "Status", "Reason", "PGP mode"]}
      loading={loading}
      rows={data?.deliveries ?? []}
      render={(d: AdminDelivery) => (
        <>
          <td>{d.envelopeTo ?? d.alias}</td>
          <td>{d.forwardedTo ?? d.recipient}</td>
          <td>{d.status}</td>
          <td>{deliveryErrorLabel(d.errorMessage)}</td>
          <td>{d.pgpModeUsed ?? d.pgpMode}</td>
        </>
      )}
    />
  );
}
function AuditLogs({
  secret,
  search,
  onError,
}: {
  secret?: string;
  search: string;
  onError: (m: string) => void;
}) {
  const { data, loading } = useAdminData<{ auditLogs: AdminAuditLog[] }>(
    () => adminApi.auditLogs(search, secret),
    [search, secret],
    onError,
  );
  return (
    <TableCard
      title="Audit Logs"
      headers={["Action", "Target type", "Target ID", "Actor", "Timestamp"]}
      loading={loading}
      rows={data?.auditLogs ?? []}
      render={(l: AdminAuditLog) => (
        <>
          <td>{l.action}</td>
          <td>{l.targetType}</td>
          <td>{l.targetId}</td>
          <td>{l.actorType}</td>
          <td>{new Date(l.timestamp).toLocaleString()}</td>
        </>
      )}
    />
  );
}

function ConfigPanel() {
  /* existing config retained */ return <ConfigInner />;
}
function ConfigInner() {
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [platformDomain, setPlatformDomain] = useState("");
  const [resendApiKey, setResendApiKey] = useState("");
  const outboundProvider = "resend" as const;
  const [msg, setMsg] = useState("");
  useEffect(() => {
    adminApi.getConfig().then((c) => {
      setConfig(c);
      setPlatformDomain(c.platformDomain ?? "");
    });
  }, []);
  const resendReady = Boolean(config?.resendConfigured);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const c = await adminApi.setConfig(platformDomain, resendApiKey, outboundProvider);
    setConfig(c);
    setResendApiKey("");
    setMsg("Configuration saved");
  };
  return (
    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <Card className="border-border bg-card-grad shadow-card">
        <CardHeader>
          <CardTitle>Admin configuration</CardTitle>
          <CardDescription>
            Manage the platform domain and Resend delivery configuration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-border bg-surface/50 p-3">
                <div className="text-xs text-muted-foreground">Platform domain</div>
                <div className="mt-1 truncate text-sm font-semibold">
                  {config?.platformDomain ?? "Not set"}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-surface/50 p-3">
                <div className="text-xs text-muted-foreground">Active provider</div>
                <div className="mt-1 text-sm font-semibold uppercase">
                  {config?.outboundProvider ?? outboundProvider}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-surface/50 p-3">
                <div className="text-xs text-muted-foreground">Forwarding</div>
                <div className="mt-1 text-sm font-semibold">
                  {config?.forwardingEnabled === false ? "Disabled" : "Enabled"}
                </div>
              </div>
            </div>
            {msg && (
              <p className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
                {msg}
              </p>
            )}
            <div className="space-y-2">
              <Label>Platform domain</Label>
              <Input
                value={platformDomain}
                onChange={(e) => setPlatformDomain(e.target.value)}
                placeholder="shieldme.cc"
              />
            </div>
            <div className="space-y-2">
              <Label>Resend API key</Label>
              <Input
                type="password"
                value={resendApiKey}
                onChange={(e) => setResendApiKey(e.target.value)}
                placeholder={
                  resendReady ? "Configured — paste only to replace" : "Paste Resend API key"
                }
              />
              <p className="text-xs text-muted-foreground">Leave blank to keep the existing key.</p>
            </div>
            <Button>Save configuration</Button>
          </form>
        </CardContent>
      </Card>
      <Card className="border-border bg-card-grad shadow-card">
        <CardHeader>
          <CardTitle>Provider status</CardTitle>
          <CardDescription>Read-only health view for mail providers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between rounded-xl border border-border bg-surface/50 p-3">
            <span>Resend</span>
            {resendReady ? (
              <Badge className="gap-1 bg-accent/20 text-accent">
                <CheckCircle2 className="h-3 w-3" />
                Configured
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                Missing
              </Badge>
            )}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Delivery credentials are never displayed in the admin interface.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
function Status({ active }: { active: boolean }) {
  return active ? (
    <Badge className="bg-accent/20 text-accent">active</Badge>
  ) : (
    <Badge variant="destructive" className="gap-1">
      <ShieldAlert className="h-3 w-3" />
      suspended
    </Badge>
  );
}
function TableCard<T>({
  title,
  headers,
  loading,
  rows,
  render,
}: {
  title: string;
  headers: string[];
  loading: boolean;
  rows: T[];
  render: (row: T) => React.ReactNode;
}) {
  return (
    <Card className="border-border bg-card-grad shadow-card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  {headers.map((header) => (
                    <th key={header} className="pb-2 pr-4 font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-t border-border [&>td]:py-3 [&>td]:pr-4">
                    {render(row)}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="py-6 text-muted-foreground">No records.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
