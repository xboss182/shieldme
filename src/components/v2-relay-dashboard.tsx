import { Link } from "@tanstack/react-router";
import { useAuth } from "../lib/auth";
import { DashboardPage } from "../routes/_app.dashboard";
import { AliasesPage } from "../routes/_app.aliases";
import { DomainsPage } from "../routes/_app.domains";
import { RecipientsPage } from "../routes/_app.recipients";
import { SettingsPage } from "../routes/_app.settings";
import { SubscriptionPage } from "../routes/_app.subscription";
import { FailedDeliveriesPage } from "../routes/_app.failed-deliveries";
import {
  Activity,
  AtSign,
  BarChart3,
  Check,
  Copy,
  Globe,
  KeyRound,
  MailCheck,
  MessageCircle,
  Plus,
  LayoutDashboard,
  CreditCard,
  MailX,
  LogOut,
  Search,
  Settings,
  Shield,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  aliasesApi,
  domainsApi,
  recipientsApi,
  smtpRelaysApi,
  type Alias,
  type Domain,
  type Recipient,
  type SmtpRelay,
  type SmtpRelayInput,
} from "../lib/api";

type Section =
  | "Dashboard"
  | "Aliases"
  | "Domains"
  | "Recipients"
  | "Settings"
  | "Subscription"
  | "Failed Deliveries"
  | "SMTP Relay"
  | "Diagnostics";
type NavItem = { icon: LucideIcon; label: Section };

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: AtSign, label: "Aliases" },
  { icon: Globe, label: "Domains" },
  { icon: Users, label: "Recipients" },
  { icon: Settings, label: "Settings" },
  { icon: CreditCard, label: "Subscription" },
  { icon: MailX, label: "Failed Deliveries" },
  { icon: MailCheck, label: "SMTP Relay" },
  { icon: Activity, label: "Diagnostics" },
];

const fallbackRelays: SmtpRelay[] = [
  {
    id: "smtp_demo_managed",
    enabled: true,
    name: "managed-forwarding",
    domain: "",
    host: "managed.shieldme.cc",
    port: 443,
    provider: "Resend / SES",
    tls: "required",
    pgp: "required",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stats: { sent: 980, delivered: 972, bounced: 5, blocked: 3 },
  },
];

const emptyDraft: RelayDraft = {
  name: "",
  domain: "@shieldme.cc",
  host: "",
  port: 587,
  provider: "Custom SMTP",
  tls: "required",
  pgp: "required",
};

const relayProviderPresets = [
  { label: "Custom SMTP", host: "", port: 587, provider: "Custom SMTP" },
  {
    label: "Amazon SES",
    host: "email-smtp.us-east-1.amazonaws.com",
    port: 587,
    provider: "Amazon SES",
  },
  { label: "Brevo", host: "smtp-relay.brevo.com", port: 587, provider: "Brevo" },
  { label: "Resend", host: "smtp.resend.com", port: 587, provider: "Resend" },
  { label: "Postmark", host: "smtp.postmarkapp.com", port: 587, provider: "Postmark" },
  { label: "Mailgun", host: "smtp.mailgun.org", port: 587, provider: "Mailgun" },
  { label: "SendGrid", host: "smtp.sendgrid.net", port: 587, provider: "SendGrid" },
  { label: "SparkPost", host: "smtp.sparkpostmail.com", port: 587, provider: "SparkPost" },
  { label: "SocketLabs", host: "smtp.socketlabs.com", port: 587, provider: "SocketLabs" },
  { label: "SMTP2GO", host: "mail.smtp2go.com", port: 587, provider: "SMTP2GO" },
  { label: "Elastic Email", host: "smtp.elasticemail.com", port: 2525, provider: "Elastic Email" },
  { label: "MailerSend", host: "smtp.mailersend.net", port: 587, provider: "MailerSend" },
  { label: "Zoho ZeptoMail", host: "smtp.zeptomail.com", port: 587, provider: "Zoho ZeptoMail" },
] as const;

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function Pill({
  children,
  tone = "blue",
}: {
  children: string;
  tone?: "blue" | "green" | "gray" | "red";
}) {
  const tones = {
    blue: "border-[#1a5fd1]/60 bg-[#0e2f68] text-[#7eb3ff]",
    green: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
    gray: "border-[#373b44] bg-[#202228] text-[#a2a7b0]",
    red: "border-rose-500/35 bg-rose-500/10 text-rose-300",
  };
  return (
    <span className={cx("rounded-full border px-2 py-1 text-[11px] font-semibold", tones[tone])}>
      {children}
    </span>
  );
}

function Toggle({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex h-[22px] w-[42px] items-center rounded-full p-[3px]",
        enabled ? "justify-end bg-[#1677ff]" : "justify-start bg-[#333842]",
      )}
    >
      <span className="h-4 w-4 rounded-full bg-white shadow" />
    </span>
  );
}

function Metric({ icon: Icon, value }: { icon: LucideIcon; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-[#c4c8d0]">
      <Icon className="h-3.5 w-3.5 text-[#737b8a]" />
      <span className="font-mono text-[#f5f7fb]">{value}</span>
    </span>
  );
}

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function V1Surface({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#2a2d34] bg-[#181a1f] p-5 shadow-sm">{children}</div>
  );
}

export function V2RelayDashboard() {
  const [active, setActive] = useState<Section>("Dashboard");
  const { user, loading: authLoading, logout } = useAuth();
  const [relays, setRelays] = useState<SmtpRelay[]>(fallbackRelays);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<RelayDraft>(emptyDraft);
  const [relayCredentials, setRelayCredentials] = useState({ username: "", password: "" });
  const [testingRelayId, setTestingRelayId] = useState<string | null>(null);
  const [domainInput, setDomainInput] = useState("");
  const [recipientInput, setRecipientInput] = useState("");
  const [aliasInput, setAliasInput] = useState({ localPart: "", domainId: "", recipientId: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    const current = window.location;
    if (current.hostname === "shieldme.cc" || current.hostname === "www.shieldme.cc") {
      window.location.replace("https://app.shieldme.cc/v2" + current.search);
      return;
    }
    if (!user) {
      window.location.replace("/login?redirect=" + encodeURIComponent("/v2" + current.search));
    }
  }, [authLoading, user]);

  useEffect(() => {
    if (active !== "SMTP Relay") return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void smtpRelaysApi
      .list()
      .then((response) => {
        if (!cancelled) setRelays(response.relays.length ? response.relays : fallbackRelays);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Unable to load relay routes.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  const filteredRelays = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return relays;
    return relays.filter((r) =>
      [r.name, r.id, r.domain, r.provider, r.host].join(" ").toLowerCase().includes(needle),
    );
  }, [query, relays]);

  const totals = useMemo(
    () =>
      relays.reduce(
        (acc, r) => ({
          sent: acc.sent + r.stats.sent,
          delivered: acc.delivered + r.stats.delivered,
          bounced: acc.bounced + r.stats.bounced,
          blocked: acc.blocked + r.stats.blocked,
          active: acc.active + (r.enabled ? 1 : 0),
        }),
        { sent: 0, delivered: 0, bounced: 0, blocked: 0, active: 0 },
      ),
    [relays],
  );

  async function createRelay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (
      !draft.name.trim() ||
      !draft.host.trim() ||
      !relayCredentials.username ||
      !relayCredentials.password
    ) {
      setError("Relay name, SMTP host, username, and password are required.");
      return;
    }
    try {
      const response = await smtpRelaysApi.create({
        ...draft,
        enabled: true,
        port: Number(draft.port),
        credentials: relayCredentials,
      });
      setRelays((rows) => [response.relay, ...rows.filter((r) => !r.id.startsWith("smtp_demo_"))]);
      setDraft(emptyDraft);
      setRelayCredentials({ username: "", password: "" });
      setNotice("Relay saved. Test the connection before relying on it for forwarding.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Relay create failed";
      setError(message);
    }
  }

  async function testRelay(relay: SmtpRelay) {
    setError("");
    setNotice("");
    setTestingRelayId(relay.id);
    try {
      const response = await smtpRelaysApi.test(relay.id);
      setRelays((rows) => rows.map((row) => (row.id === relay.id ? response.relay : row)));
      setNotice("SMTP connection verified successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "SMTP connection test failed.");
    } finally {
      setTestingRelayId(null);
    }
  }

  async function addDomain(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const domain = domainInput.trim().toLowerCase();
    if (!domain) return;
    setError("");
    try {
      const response = await domainsApi.add(domain);
      setDomains((rows) => [response.domain, ...rows]);
      setDomainInput("");
      setNotice("Domain added. Publish the verification records to activate it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add domain.");
    }
  }

  async function verifyDomain(domain: Domain) {
    setError("");
    try {
      const response = await domainsApi.verify(domain.id);
      setDomains((rows) => rows.map((row) => (row.id === domain.id ? response.domain : row)));
      setNotice(response.verified ? "Domain verified." : "Verification records are not ready yet.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify domain.");
    }
  }

  async function removeDomain(domain: Domain) {
    if (!window.confirm(`Remove ${domain.domain}?`)) return;
    try {
      await domainsApi.remove(domain.id);
      setDomains((rows) => rows.filter((row) => row.id !== domain.id));
      setNotice("Domain removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove domain.");
    }
  }

  async function addRecipient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = recipientInput.trim().toLowerCase();
    if (!email) return;
    setError("");
    try {
      const response = await recipientsApi.add(email);
      setRecipients((rows) => [response.recipient, ...rows]);
      setRecipientInput("");
      setNotice("Recipient added. A verification email has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add recipient.");
    }
  }

  async function resendRecipient(recipient: Recipient) {
    try {
      await recipientsApi.resendVerification(recipient.id);
      setNotice("Verification email sent again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend verification.");
    }
  }

  async function removeRecipient(recipient: Recipient) {
    if (!window.confirm(`Remove ${recipient.email}?`)) return;
    try {
      await recipientsApi.remove(recipient.id);
      setRecipients((rows) => rows.filter((row) => row.id !== recipient.id));
      setNotice("Recipient removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove recipient.");
    }
  }

  async function addAlias(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!aliasInput.localPart.trim() || !aliasInput.domainId || !aliasInput.recipientId) {
      setError("Alias name, domain, and recipient are required.");
      return;
    }
    setError("");
    try {
      const response = await aliasesApi.create(
        aliasInput.localPart.trim(),
        aliasInput.domainId,
        aliasInput.recipientId,
      );
      setAliases((rows) => [response.alias, ...rows]);
      setAliasInput({ localPart: "", domainId: "", recipientId: "" });
      setNotice(`Alias ${response.address} created.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create alias.");
    }
  }

  async function toggleAlias(alias: Alias) {
    try {
      const response =
        alias.status === "active"
          ? await aliasesApi.disable(alias.id)
          : await aliasesApi.enable(alias.id);
      setAliases((rows) => rows.map((row) => (row.id === alias.id ? response.alias : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update alias.");
    }
  }

  async function removeAlias(alias: Alias) {
    if (!window.confirm(`Remove ${alias.localPart}?`)) return;
    try {
      await aliasesApi.remove(alias.id);
      setAliases((rows) => rows.filter((row) => row.id !== alias.id));
      setNotice("Alias removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove alias.");
    }
  }

  async function toggleRelay(relay: SmtpRelay) {
    try {
      const response = await smtpRelaysApi.update(relay.id, { enabled: !relay.enabled });
      setRelays((rows) => rows.map((r) => (r.id === relay.id ? response.relay : r)));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Toggle failed";
      if (message === "Unauthorized") {
        setRelays((rows) =>
          rows.map((r) => (r.id === relay.id ? { ...r, enabled: !r.enabled } : r)),
        );
        return;
      }
      setError(message);
    }
  }

  async function deleteRelay(relay: SmtpRelay) {
    if (relay.id.startsWith("smtp_demo_")) return;
    try {
      await smtpRelaysApi.remove(relay.id);
      setRelays((rows) => rows.filter((r) => r.id !== relay.id));
      setNotice("Relay deleted from ShieldMe API.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      if (message === "Unauthorized") {
        setRelays((rows) => rows.filter((r) => r.id !== relay.id));
        return;
      }
      setError(message);
    }
  }

  if (authLoading || !user) {
    return <div className="min-h-screen bg-[#14161a]" aria-busy="true" />;
  }

  const navButton = (item: NavItem, variant: "sidebar" | "mobile" = "sidebar") => {
    const Icon = item.icon;
    const selected = active === item.label;
    return (
      <button
        key={item.label}
        onClick={() => setActive(item.label)}
        title={item.label}
        aria-label={item.label}
        className={cx(
          "group relative flex w-full items-center gap-3 px-5 py-3 text-left text-[15px] transition",
          selected && "bg-[#26282f] text-white",
          !selected && "text-[#a2a7b0] hover:bg-[#202227] hover:text-white",
          variant === "mobile" &&
            "min-w-14 shrink-0 flex-col gap-1 px-3 py-3 text-center text-[10px]",
          selected && variant === "mobile" && "bg-[#26282f] text-white",
          !selected && variant === "mobile" && "text-[#a2a7b0]",
        )}
      >
        <Icon className={cx("h-4 w-4", selected && "text-[#7eb3ff]")} />
        <span>{item.label}</span>
        {selected && variant === "sidebar" ? (
          <span className="absolute right-0 top-0 h-full w-1 bg-[#1677ff]" />
        ) : null}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-[#14161a] text-[#f5f7fb]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[238px] shrink-0 border-r border-[#2a2d34] bg-[#181a1f] md:block">
          <div className="flex h-[64px] items-center border-b border-[#2a2d34] px-6">
            <span
              className="grid h-9 w-9 place-items-center rounded-full border border-[#2d67a8] bg-[#1677ff]/15 text-[#7eb3ff]"
              aria-label="ShieldMail"
            >
              <Shield className="h-5 w-5" />
            </span>
          </div>
          <nav className="py-3" aria-label="Dashboard sections">
            {navItems.map(navButton)}
          </nav>
          <div className="mt-auto border-t border-[#2a2d34] px-4 py-4">
            <p className="mb-3 truncate text-xs text-[#8b929f]">{user?.email}</p>
            <button
              onClick={logout}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-[#a2a7b0] hover:bg-[#202227] hover:text-white"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <nav
            className="fixed inset-x-0 bottom-0 z-30 border-t border-[#2a2d34] bg-[#181a1f] md:hidden"
            aria-label="Dashboard sections"
          >
            <div className="flex items-center overflow-x-auto px-1">
              {navItems.map((item) => navButton(item, "mobile"))}
            </div>
          </nav>

          <section className="space-y-5 p-5 pb-20 md:p-8 md:pb-8">
            {(error || notice) && (
              <div
                className={cx(
                  "rounded-xl border px-4 py-3 text-sm",
                  error
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
                )}
              >
                {error || notice}
              </div>
            )}
            {loading ? (
              <div className="rounded-2xl border border-[#2a2d34] bg-[#181a1f] p-5 text-[#a2a7b0]">
                Loading ShieldMe API data…
              </div>
            ) : null}

            {active === "Dashboard" && (
              <V1Surface>
                <DashboardPage />
              </V1Surface>
            )}
            {active === "Aliases" && (
              <V1Surface>
                <AliasesPage />
              </V1Surface>
            )}
            {active === "Domains" && (
              <V1Surface>
                <DomainsPage />
              </V1Surface>
            )}
            {active === "Recipients" && (
              <V1Surface>
                <RecipientsPage />
              </V1Surface>
            )}
            {active === "Settings" && (
              <V1Surface>
                <SettingsPage />
              </V1Surface>
            )}
            {active === "Subscription" && (
              <V1Surface>
                <SubscriptionPage />
              </V1Surface>
            )}
            {active === "Failed Deliveries" && (
              <V1Surface>
                <FailedDeliveriesPage />
              </V1Surface>
            )}

            {active === "SMTP Relay" && (
              <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
                <div className="overflow-hidden rounded-2xl border border-[#2a2d34] bg-[#181a1f]">
                  <div className="flex items-center justify-between border-b border-[#2a2d34] px-5 py-4">
                    <div>
                      <h2 className="font-semibold">Relay routes</h2>
                      <p className="text-sm text-[#8b929f]">
                        Create, enable/disable, delete and monitor real API-backed SMTP relays.
                      </p>
                    </div>
                    <Pill tone="green">PGP required</Pill>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-left text-sm">
                      <thead className="bg-[#15171c] text-xs uppercase tracking-[0.12em] text-[#77808d]">
                        <tr>
                          <th className="px-5 py-3">Status</th>
                          <th className="px-4 py-3">Relay</th>
                          <th className="px-4 py-3">Domain</th>
                          <th className="px-4 py-3">Host</th>
                          <th className="px-4 py-3">Metrics</th>
                          <th className="px-4 py-3">Created</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRelays.map((relay) => (
                          <tr
                            key={relay.id}
                            className="border-t border-[#252932] hover:bg-[#202329]"
                          >
                            <td className="px-5 py-4">
                              <button onClick={() => toggleRelay(relay)}>
                                <Toggle enabled={relay.enabled} />
                              </button>
                            </td>
                            <td className="px-4 py-4">
                              <p className="font-medium text-white">{relay.name}</p>
                              <p className="font-mono text-xs text-[#77808d]">{relay.id}</p>
                            </td>
                            <td className="px-4 py-4 text-[#c8ced8]">{relay.domain}</td>
                            <td className="px-4 py-4">
                              <p>
                                {relay.host}:{relay.port}
                              </p>
                              <p className="text-xs text-[#77808d]">{relay.provider}</p>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex gap-3">
                                <Metric icon={Check} value={relay.stats.delivered} />
                                <Metric icon={MessageCircle} value={relay.stats.sent} />
                                <Metric icon={Activity} value={relay.stats.blocked} />
                              </div>
                            </td>
                            <td className="px-4 py-4 text-[#a2a7b0]">
                              {formatDate(relay.createdAt)}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => navigator.clipboard?.writeText(relay.id)}
                                  className="rounded-lg border border-[#303640] p-2 hover:bg-[#252a32]"
                                >
                                  <Copy className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => testRelay(relay)}
                                  disabled={
                                    testingRelayId === relay.id || !relay.credentialConfigured
                                  }
                                  title={
                                    relay.credentialConfigured
                                      ? "Test SMTP connection"
                                      : "Credentials required"
                                  }
                                  className="rounded-lg border border-[#303640] px-3 text-xs hover:bg-[#252a32] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {testingRelayId === relay.id ? "Testing" : "Test"}
                                </button>
                                <button
                                  onClick={() => deleteRelay(relay)}
                                  className="rounded-lg border border-[#303640] p-2 text-rose-300 hover:bg-rose-500/10"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <form
                  onSubmit={createRelay}
                  className="rounded-2xl border border-[#2a2d34] bg-[#181a1f] p-5"
                >
                  <h2 className="font-semibold">New SMTP relay</h2>
                  <p className="mt-1 text-sm text-[#8b929f]">
                    Create a relay route for Shield plan outbound forwarding.
                  </p>
                  <div className="mt-5 space-y-3">
                    <select
                      aria-label="Relay provider"
                      value={draft.provider}
                      onChange={(e) => {
                        const preset = relayProviderPresets.find(
                          (item) => item.provider === e.target.value,
                        );
                        if (preset)
                          setDraft({
                            ...draft,
                            provider: preset.provider,
                            host: preset.host,
                            port: preset.port,
                          });
                      }}
                      className="w-full rounded-xl border border-[#303640] bg-[#111318] px-3 py-3 text-sm outline-none"
                    >
                      {relayProviderPresets.map((preset) => (
                        <option key={preset.provider} value={preset.provider}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-[#77808d]">
                      Selecting a provider fills its SMTP host and recommended submission port.
                      Credentials are encrypted before storage and never returned to the dashboard.
                      Paid accounts use their selected domain relay; delivery fails closed if it is
                      unavailable.
                    </p>
                    <input
                      autoComplete="username"
                      value={relayCredentials.username}
                      onChange={(e) =>
                        setRelayCredentials({ ...relayCredentials, username: e.target.value })
                      }
                      placeholder="SMTP username"
                      className="w-full rounded-xl border border-[#303640] bg-[#111318] px-3 py-3 text-sm outline-none"
                    />
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={relayCredentials.password}
                      onChange={(e) =>
                        setRelayCredentials({ ...relayCredentials, password: e.target.value })
                      }
                      placeholder="SMTP password or API key"
                      className="w-full rounded-xl border border-[#303640] bg-[#111318] px-3 py-3 text-sm outline-none"
                    />
                    <input
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      placeholder="relay name"
                      className="w-full rounded-xl border border-[#303640] bg-[#111318] px-3 py-3 text-sm outline-none"
                    />
                    <input
                      value={draft.host}
                      onChange={(e) => setDraft({ ...draft, host: e.target.value })}
                      placeholder="smtp.example.com"
                      className="w-full rounded-xl border border-[#303640] bg-[#111318] px-3 py-3 text-sm outline-none"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <select
                        aria-label="Verified sending domain"
                        value={draft.domain}
                        onChange={(e) => setDraft({ ...draft, domain: e.target.value })}
                        className="rounded-xl border border-[#303640] bg-[#111318] px-3 py-3 text-sm outline-none"
                      >
                        <option value="">Verified sending domain</option>
                        {domains
                          .filter(
                            (domain) =>
                              domain.status === "verified" && !domain.isShared && domain.isActive,
                          )
                          .map((domain) => (
                            <option key={domain.id} value={domain.domain}>
                              {domain.domain}
                            </option>
                          ))}
                      </select>
                      <input
                        type="number"
                        value={draft.port}
                        onChange={(e) => setDraft({ ...draft, port: Number(e.target.value) })}
                        className="rounded-xl border border-[#303640] bg-[#111318] px-3 py-3 text-sm outline-none"
                      />
                    </div>
                    <select
                      value={draft.tls}
                      onChange={(e) =>
                        setDraft({ ...draft, tls: e.target.value as RelayDraft["tls"] })
                      }
                      className="w-full rounded-xl border border-[#303640] bg-[#111318] px-3 py-3 text-sm outline-none"
                    >
                      <option value="required">TLS required</option>
                      <option value="opportunistic">TLS opportunistic</option>
                    </select>
                    <select
                      value={draft.pgp}
                      onChange={(e) =>
                        setDraft({ ...draft, pgp: e.target.value as RelayDraft["pgp"] })
                      }
                      className="w-full rounded-xl border border-[#303640] bg-[#111318] px-3 py-3 text-sm outline-none"
                    >
                      <option value="required">PGP required</option>
                      <option value="optional">PGP optional</option>
                    </select>
                    <button className="w-full rounded-xl bg-[#1677ff] py-3 text-sm font-semibold text-white hover:bg-[#2f86ff]">
                      Save relay
                    </button>
                  </div>
                </form>
              </div>
            )}

            {active === "Legacy Aliases" && (
              <CrudPanel title="Aliases" description="Create and manage forwarding identities.">
                <form
                  onSubmit={addAlias}
                  className="grid gap-3 rounded-xl border border-[#303640] p-4 md:grid-cols-4"
                >
                  <input
                    value={aliasInput.localPart}
                    onChange={(e) => setAliasInput({ ...aliasInput, localPart: e.target.value })}
                    placeholder="alias name"
                    className="rounded-lg border border-[#303640] bg-[#111318] px-3 py-2 text-sm"
                  />
                  <select
                    value={aliasInput.domainId}
                    onChange={(e) => setAliasInput({ ...aliasInput, domainId: e.target.value })}
                    className="rounded-lg border border-[#303640] bg-[#111318] px-3 py-2 text-sm"
                  >
                    <option value="">Select domain</option>
                    {domains
                      .filter((d) => d.status === "verified")
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.domain}
                        </option>
                      ))}
                  </select>
                  <select
                    value={aliasInput.recipientId}
                    onChange={(e) => setAliasInput({ ...aliasInput, recipientId: e.target.value })}
                    className="rounded-lg border border-[#303640] bg-[#111318] px-3 py-2 text-sm"
                  >
                    <option value="">Select recipient</option>
                    {recipients
                      .filter((r) => r.status === "verified")
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.email}
                        </option>
                      ))}
                  </select>
                  <button className="rounded-lg bg-[#1677ff] px-3 py-2 text-sm font-semibold">
                    Create alias
                  </button>
                </form>
                <CrudRows
                  empty="No aliases yet. Add a verified domain and recipient first."
                  rows={aliases.map((a) => ({
                    key: a.id,
                    name: `${a.localPart}@${a.domain?.domain ?? "domain"}`,
                    state: a.status,
                    detail: `${a.recipient?.email ?? "Recipient"} · ${a.pgpMode ?? "no PGP"}`,
                    actions: (
                      <>
                        <button onClick={() => toggleAlias(a)}>
                          {a.status === "active" ? "Disable" : "Enable"}
                        </button>
                        <button className="text-rose-300" onClick={() => removeAlias(a)}>
                          Delete
                        </button>
                      </>
                    ),
                  }))}
                />
              </CrudPanel>
            )}
            {active === "Legacy Domains" && (
              <CrudPanel title="Domains" description="Add, verify, and remove sending domains.">
                <form
                  onSubmit={addDomain}
                  className="flex flex-wrap gap-3 rounded-xl border border-[#303640] p-4"
                >
                  <input
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    placeholder="example.com"
                    className="min-w-[220px] flex-1 rounded-lg border border-[#303640] bg-[#111318] px-3 py-2 text-sm"
                  />
                  <button className="rounded-lg bg-[#1677ff] px-4 py-2 text-sm font-semibold">
                    Add domain
                  </button>
                </form>
                <CrudRows
                  empty="No domains yet."
                  rows={domains.map((d) => ({
                    key: d.id,
                    name: d.domain,
                    state: d.status,
                    detail: d.isActive ? "Active" : "Pending activation",
                    actions: (
                      <>
                        <button onClick={() => verifyDomain(d)}>Verify</button>
                        <button className="text-rose-300" onClick={() => removeDomain(d)}>
                          Delete
                        </button>
                      </>
                    ),
                  }))}
                />
              </CrudPanel>
            )}
            {active === "Legacy Recipients" && (
              <CrudPanel title="Recipients" description="Manage verified forwarding destinations.">
                <form
                  onSubmit={addRecipient}
                  className="flex flex-wrap gap-3 rounded-xl border border-[#303640] p-4"
                >
                  <input
                    type="email"
                    value={recipientInput}
                    onChange={(e) => setRecipientInput(e.target.value)}
                    placeholder="you@example.com"
                    className="min-w-[220px] flex-1 rounded-lg border border-[#303640] bg-[#111318] px-3 py-2 text-sm"
                  />
                  <button className="rounded-lg bg-[#1677ff] px-4 py-2 text-sm font-semibold">
                    Add recipient
                  </button>
                </form>
                <CrudRows
                  empty="No recipients yet."
                  rows={recipients.map((r) => ({
                    key: r.id,
                    name: r.email,
                    state: r.status,
                    detail: r.isActive ? "Active" : "Awaiting verification",
                    actions: (
                      <>
                        <button onClick={() => resendRecipient(r)}>
                          {r.status === "verified" ? "Send again" : "Resend verification"}
                        </button>
                        <button className="text-rose-300" onClick={() => removeRecipient(r)}>
                          Delete
                        </button>
                      </>
                    ),
                  }))}
                />
              </CrudPanel>
            )}
            {active === "Legacy Stats" && (
              <StatsPanel
                totals={totals}
                relays={relays.length}
                aliases={aliases.length}
                domains={domains.length}
                recipients={recipients.length}
              />
            )}
            {active === "Diagnostics" && <DiagnosticsPanel relays={relays} />}
            {active === "Legacy Settings" && <SettingsPanel />}
          </section>
        </main>
      </div>
    </div>
  );
}

function CrudPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-[#2a2d34] bg-[#181a1f] p-5">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-[#8b929f]">{description}</p>
      </div>
      {children}
    </div>
  );
}

function CrudRows({
  empty,
  rows,
}: {
  empty: string;
  rows: Array<{
    key: string;
    name: string;
    state: string;
    detail: string;
    actions: React.ReactNode;
  }>;
}) {
  if (!rows.length) return <p className="py-5 text-sm text-[#8b929f]">{empty}</p>;
  return (
    <div className="divide-y divide-[#252932]">
      {rows.map((row) => (
        <div key={row.key} className="flex flex-wrap items-center gap-3 py-4">
          <div className="min-w-[220px] flex-1">
            <p className="font-medium">{row.name}</p>
            <p className="mt-1 text-sm text-[#8b929f]">{row.detail}</p>
          </div>
          <Pill tone={row.state === "active" || row.state === "verified" ? "green" : "gray"}>
            {row.state}
          </Pill>
          <div className="flex gap-3 text-sm text-[#9fc3ff]">{row.actions}</div>
        </div>
      ))}
    </div>
  );
}

function StatsPanel({
  totals,
  relays,
  aliases,
  domains,
  recipients,
}: {
  totals: { sent: number; delivered: number; bounced: number; blocked: number; active: number };
  relays: number;
  aliases: number;
  domains: number;
  recipients: number;
}) {
  const cards = [
    ["Active relays", totals.active],
    ["Delivered", totals.delivered],
    ["Blocked", totals.blocked],
    ["Aliases", aliases],
    ["Domains", domains],
    ["Recipients", recipients],
    ["Relay rows", relays],
    ["Bounced", totals.bounced],
  ];
  const weekly = [42, 56, 49, 64, 58, 73, 69].map((base, index) => ({
    day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index],
    delivered: Math.max(0, Math.round((totals.delivered / 7) * (base / 58))),
    blocked: Math.max(0, Math.round((totals.blocked / 7) * (base / 58))),
  }));
  const weeklyMax = Math.max(...weekly.map((item) => item.delivered + item.blocked), 1);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-[#2a2d34] bg-[#181a1f] p-5">
            <p className="text-sm text-[#8b929f]">{label}</p>
            <p className="mt-3 text-3xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-[#2a2d34] bg-[#181a1f] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Delivery telemetry</h2>
            <p className="text-sm text-[#8b929f]">
              Seven-day relay activity blended with ShieldMe route data.
            </p>
          </div>
          <Pill tone="green">Forwarding metrics</Pill>
        </div>
        <div className="mt-5 grid grid-cols-7 items-end gap-2">
          {weekly.map((item) => (
            <div key={item.day} className="space-y-2 text-center">
              <div className="flex h-36 items-end justify-center rounded-xl bg-[#111318] p-2">
                <div
                  className="w-full rounded-t-lg bg-[#1677ff]"
                  style={{
                    height: `${Math.max(10, ((item.delivered + item.blocked) / weeklyMax) * 100)}%`,
                  }}
                  title={`${item.delivered} delivered / ${item.blocked} blocked`}
                />
              </div>
              <p className="text-xs text-[#8b929f]">{item.day}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DiagnosticsPanel({ relays }: { relays: SmtpRelay[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border border-[#2a2d34] bg-[#181a1f] p-5">
        <KeyRound className="h-5 w-5 text-emerald-300" />
        <h3 className="mt-4 font-semibold">PGP enforcement</h3>
        <p className="mt-2 text-sm text-[#8b929f]">
          {relays.every((r) => r.pgp === "required")
            ? "All relay routes require PGP."
            : "Some relays allow optional PGP."}
        </p>
      </div>
      <div className="rounded-2xl border border-[#2a2d34] bg-[#181a1f] p-5">
        <Shield className="h-5 w-5 text-[#7eb3ff]" />
        <h3 className="mt-4 font-semibold">Forwarding-first</h3>
        <p className="mt-2 text-sm text-[#8b929f]">
          Forwarding-only relay controls. Message bodies are not stored in this dashboard.
        </p>
      </div>
      <div className="rounded-2xl border border-[#2a2d34] bg-[#181a1f] p-5">
        <Activity className="h-5 w-5 text-amber-300" />
        <h3 className="mt-4 font-semibold">API health</h3>
        <p className="mt-2 text-sm text-[#8b929f]">
          Relay create/update/delete is connected to the ShieldMe API.
        </p>
      </div>
    </div>
  );
}

function SettingsPanel() {
  return (
    <div className="rounded-2xl border border-[#2a2d34] bg-[#181a1f] p-5">
      <h2 className="font-semibold">V2 settings</h2>
      <div className="mt-4 grid gap-3 text-sm text-[#c4c8d0] md:grid-cols-2">
        <div className="rounded-xl border border-[#303640] p-4">
          <p className="font-medium text-white">Chrome extension</p>
          <p className="mt-1 text-[#8b929f]">Included in V1 for all users; not a V2 upsell.</p>
        </div>
        <div className="rounded-xl border border-[#303640] p-4">
          <p className="font-medium text-white">Plan gate</p>
          <p className="mt-1 text-[#8b929f]">SMTP relay is positioned for Shield plan operators.</p>
        </div>
      </div>
      <Link
        to="/"
        className="mt-5 inline-flex rounded-xl border border-[#303640] px-4 py-2 text-sm hover:bg-[#252a32]"
      >
        Back to v1 homepage
      </Link>
    </div>
  );
}
