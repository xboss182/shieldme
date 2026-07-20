import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  aliasesApi,
  aliasesOutboundApi,
  ApiError,
  domainsApi,
  recipientsApi,
  smtpRelaysApi,
  tokenStore,
  type Alias,
  type Domain,
  type Recipient,
  type SmtpRelay,
  type SmtpRelayAuditEvent,
  type SmtpRelayStatus,
} from "../lib/api";
import {
  canAssignCustomRelay,
  relayCheckRows,
  relayPageState,
  smtpRelayStatusLabel,
} from "../lib/smtp-relay-ui";

type Notice = { tone: "error" | "success"; message: string; code?: string } | null;
type CredentialDraft = { username: string; password: string; recipientId: string };

const emptyProfile = {
  label: "",
  domainId: "",
  host: "",
  port: "587" as "465" | "587",
  tlsMode: "starttls" as "implicit_tls" | "starttls",
  authMethod: "plain" as "plain" | "login",
  username: "",
  password: "",
  identityLocalPart: "forward",
  bounceSpfInclude: "include:spf.shieldme.cc",
};

function apiNotice(error: unknown): Notice {
  if (error instanceof ApiError) return { tone: "error", message: error.message, code: error.code };
  return {
    tone: "error",
    message: error instanceof Error ? error.message : "The request could not be completed.",
  };
}

function date(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function statusTone(status: SmtpRelayStatus) {
  if (["ready", "active"].includes(status))
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (["degraded", "circuit_open", "revoked"].includes(status))
    return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  if (status === "disabled") return "border-border bg-surface text-muted-foreground";
  return "border-amber-500/30 bg-amber-500/10 text-amber-300";
}

function StatusBadge({ status }: { status: SmtpRelayStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(status)}`}
    >
      {smtpRelayStatusLabel[status]}
    </span>
  );
}

function Step({
  index,
  title,
  current,
  complete,
}: {
  index: number;
  title: string;
  current: boolean;
  complete: boolean;
}) {
  return (
    <li className="flex min-w-36 items-center gap-2 text-xs">
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${complete ? "border-emerald-500 bg-emerald-500 text-background" : current ? "border-accent bg-accent/15 text-accent" : "border-border text-muted-foreground"}`}
      >
        {complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : index}
      </span>
      <span className={current ? "font-semibold text-foreground" : "text-muted-foreground"}>
        {title}
      </span>
    </li>
  );
}

function StatePanel({
  title,
  children,
  icon: Icon = ShieldAlert,
}: {
  title: string;
  children: React.ReactNode;
  icon?: typeof ShieldAlert;
}) {
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center rounded-2xl border border-border bg-card-grad px-6 py-16 text-center shadow-card">
      <Icon className="mb-4 h-9 w-9 text-accent" />
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <div className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{children}</div>
    </section>
  );
}

export function V2RelayDashboard() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [relays, setRelays] = useState<SmtpRelay[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [events, setEvents] = useState<SmtpRelayAuditEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profile, setProfile] = useState(emptyProfile);
  const [rotation, setRotation] = useState<CredentialDraft>({
    username: "",
    password: "",
    recipientId: "",
  });
  const [testRecipientId, setTestRecipientId] = useState("");
  const [confirmation, setConfirmation] = useState({ testId: "", token: "" });
  const [acknowledgeNoFallback, setAcknowledgeNoFallback] = useState(false);
  const [destructiveConfirmed, setDestructiveConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [featureEnabled, setFeatureEnabled] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const verifiedDomains = useMemo(
    () =>
      domains.filter(
        (domain) => domain.status === "verified" && domain.isActive && !domain.isShared,
      ),
    [domains],
  );
  const verifiedRecipients = useMemo(
    () => recipients.filter((recipient) => recipient.status === "verified" && recipient.isActive),
    [recipients],
  );
  const selectedRelay = relays.find((relay) => relay.id === selectedId) ?? null;
  const state = relayPageState({
    loading,
    enabled: featureEnabled,
    error: loadFailed,
    relayCount: relays.length,
  });

  async function refresh() {
    setLoading(true);
    setLoadFailed(false);
    setNotice(null);
    try {
      const [relayData, domainData, recipientData, aliasData] = await Promise.all([
        smtpRelaysApi.list(),
        domainsApi.list(),
        recipientsApi.list(),
        aliasesApi.list(),
      ]);
      setRelays(relayData.relays);
      setDomains(domainData.domains);
      setRecipients(recipientData.recipients);
      setAliases(aliasData.aliases);
      setFeatureEnabled(true);
      setSelectedId((current) => current ?? relayData.relays[0]?.id ?? null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        window.location.replace("/login");
        return;
      }
      const nextNotice = apiNotice(error);
      setNotice(nextNotice);
      setLoadFailed(true);
      setFeatureEnabled(!(error instanceof ApiError && error.code === "byo_smtp_disabled"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setAuthenticated(tokenStore.getAccess() !== null);
  }, []);

  useEffect(() => {
    if (authenticated === null) return;
    if (!authenticated) {
      window.location.replace("/login");
      return;
    }
    void refresh();
  }, [authenticated]);

  const selectedRelayId = selectedRelay?.id;

  useEffect(() => {
    if (!selectedRelayId) {
      setEvents([]);
      return;
    }
    void smtpRelaysApi
      .auditEvents(selectedRelayId)
      .then((data) => setEvents(data.events))
      .catch(() => setEvents([]));
  }, [selectedRelayId]);

  async function createRelay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setNotice(null);
    try {
      const result = await smtpRelaysApi.create({
        label: profile.label,
        domainId: profile.domainId,
        host: profile.host,
        port: Number(profile.port) as 465 | 587,
        tlsMode: profile.tlsMode,
        authMethod: profile.authMethod,
        username: profile.username,
        password: profile.password,
        identityLocalPart: profile.identityLocalPart,
        bounceSpfInclude: profile.bounceSpfInclude,
      });
      setRelays((current) => [result.relay, ...current]);
      setSelectedId(result.relay.id);
      setProfile(emptyProfile);
      setNotice({
        tone: "success",
        message:
          "SMTP profile stored. The password is write-only and is no longer kept in this page.",
      });
    } catch (error) {
      setNotice(apiNotice(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function runTest(relay: SmtpRelay, recipientId: string) {
    if (!recipientId) {
      setNotice({
        tone: "error",
        message: "Select one of your verified recipients for the test message.",
      });
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      const result = await smtpRelaysApi.test(relay.id, recipientId);
      await refresh();
      setConfirmation({ testId: result.test.id, token: "" });
      setNotice({
        tone: "success",
        message: `SMTP submitted a test message. Delivery is not confirmed until you enter the received confirmation token. Expires ${date(result.test.expiresAt)}.`,
      });
    } catch (error) {
      setNotice(apiNotice(error));
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRelay || !confirmation.testId || !confirmation.token) return;
    setSubmitting(true);
    try {
      const result = await smtpRelaysApi.confirmTest(
        selectedRelay.id,
        confirmation.testId,
        confirmation.token,
      );
      setRelays((current) =>
        current.map((relay) => (relay.id === result.relay.id ? result.relay : relay)),
      );
      setConfirmation({ testId: "", token: "" });
      setNotice({
        tone: "success",
        message:
          "Delivery confirmed. The relay is ready; assign aliases only after reviewing the fail-closed policy.",
      });
    } catch (error) {
      setNotice(apiNotice(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function rotateCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRelay || !rotation.recipientId) return;
    setSubmitting(true);
    try {
      const result = await smtpRelaysApi.rotateCredentials(selectedRelay.id, rotation);
      setRotation({ username: "", password: "", recipientId: "" });
      setConfirmation({ testId: result.test.id, token: "" });
      setNotice({
        tone: "success",
        message:
          "New credentials are staged, not switched. Confirm the new test message to complete rotation; the prior active credentials remain in use until then.",
      });
      await refresh();
    } catch (error) {
      setNotice(apiNotice(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function setRelayState(action: "enable" | "disable" | "revoke") {
    if (!selectedRelay) return;
    setSubmitting(true);
    try {
      const result = await smtpRelaysApi[action](selectedRelay.id);
      setRelays((current) =>
        current.map((relay) => (relay.id === result.relay.id ? result.relay : relay)),
      );
      setNotice({
        tone: "success",
        message:
          action === "disable"
            ? "Relay disabled. Custom-routed aliases now fail closed; ShieldMe will not use the platform fallback."
            : action === "revoke"
              ? "Credentials revoked. Re-enter and test new credentials before reactivation."
              : "Relay reactivated.",
      });
    } catch (error) {
      setNotice(apiNotice(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteRelay() {
    if (!selectedRelay || !destructiveConfirmed) return;
    setSubmitting(true);
    try {
      await smtpRelaysApi.remove(selectedRelay.id);
      setRelays((current) => current.filter((relay) => relay.id !== selectedRelay.id));
      setSelectedId(null);
      setDestructiveConfirmed(false);
      setNotice({
        tone: "success",
        message:
          "Relay deleted. Any assigned aliases must be unassigned first and return to platform forwarding only when you explicitly select it.",
      });
    } catch (error) {
      setNotice(apiNotice(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function assignAlias(alias: Alias) {
    if (
      !selectedRelay ||
      !acknowledgeNoFallback ||
      !canAssignCustomRelay(selectedRelay.status, selectedRelay.circuitStatus)
    )
      return;
    setSubmitting(true);
    try {
      const result = await aliasesOutboundApi.setRoute(alias.id, {
        mode: "custom_smtp",
        relayId: selectedRelay.id,
        acknowledgeNoFallback: true,
      });
      setAliases((current) =>
        current.map((item) => (item.id === result.alias.id ? result.alias : item)),
      );
      setNotice({
        tone: "success",
        message: `${alias.localPart}@${alias.domain?.domain ?? "your domain"} now fails closed through this relay. Platform fallback is off.`,
      });
    } catch (error) {
      setNotice(apiNotice(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function unassignAlias(alias: Alias) {
    setSubmitting(true);
    try {
      const result = await aliasesOutboundApi.setRoute(alias.id, { mode: "platform" });
      setAliases((current) =>
        current.map((item) => (item.id === result.alias.id ? result.alias : item)),
      );
      setNotice({
        tone: "success",
        message: `${alias.localPart} now uses platform forwarding again.`,
      });
    } catch (error) {
      setNotice(apiNotice(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (authenticated === null || state === "loading")
    return (
      <StatePanel title="Loading relay controls" icon={LoaderCircle}>
        Checking your domains, verified recipients, aliases, and relay health.
      </StatePanel>
    );
  if (state === "disabled")
    return (
      <StatePanel title="BYO SMTP is not enabled">
        <p>
          This optional feature is disabled for this account. V1 forwarding remains unchanged; no
          custom SMTP controls are available.
        </p>
        <Link
          to="/dashboard"
          className="mt-5 inline-flex rounded-lg bg-accent px-4 py-2 font-semibold text-primary-foreground"
        >
          Return to V1 dashboard
        </Link>
      </StatePanel>
    );
  if (state === "error")
    return (
      <StatePanel title="Could not load relay controls" icon={AlertTriangle}>
        <p>{notice?.message}</p>
        <button
          onClick={() => void refresh()}
          className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 font-semibold hover:bg-surface-2"
        >
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      </StatePanel>
    );

  const steps = [
    "Verify domain",
    "Add profile",
    "Test and confirm",
    "Assign aliases",
    "Manage health",
  ];
  const profileReady = Boolean(selectedRelay);
  const testReady = selectedRelay ? ["ready", "active"].includes(selectedRelay.status) : false;

  return (
    <main className="mx-auto max-w-7xl space-y-6 pb-12">
      <header className="overflow-hidden rounded-2xl border border-border bg-card-grad p-5 shadow-card md:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              Optional SMTP relay
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold">Bring your own SMTP, safely</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Your custom relay forwards only to your verified recipients. It never becomes a send
              API. Custom-routed aliases fail closed when this relay is unavailable; platform
              fallback is off.
            </p>
          </div>
          <button
            onClick={() => void refresh()}
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold hover:bg-surface-2 disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" /> Refresh status
          </button>
        </div>
        <ol className="mt-6 flex gap-3 overflow-x-auto pb-1">
          {steps.map((title, index) => (
            <Step
              key={title}
              index={index + 1}
              title={title}
              current={
                (index === 0 && !profileReady) ||
                (index === 1 && profileReady && !testReady) ||
                (index === 2 && testReady)
              }
              complete={
                (index === 0 && verifiedDomains.length > 0) ||
                (index === 1 && profileReady) ||
                (index === 2 && testReady)
              }
            />
          ))}
        </ol>
      </header>

      {notice && (
        <div
          role="status"
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${notice.tone === "error" ? "border-rose-500/30 bg-rose-500/10 text-rose-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"}`}
        >
          {notice.tone === "error" ? (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>
            {notice.message}
            {notice.code ? (
              <span className="ml-2 font-mono text-xs opacity-80">{notice.code}</span>
            ) : null}
          </span>
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card-grad p-5 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold">1. Verified custom domain</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Only verified, owned, active domains can carry a relay identity.
                </p>
              </div>
              <Link
                to="/domains"
                className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
              >
                Manage domains <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            {verifiedDomains.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {verifiedDomains.map((domain) => (
                  <span
                    key={domain.id}
                    className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-300"
                  >
                    <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                    {domain.domain}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                No verified owned domain yet. Verify one under Domains before adding SMTP
                credentials.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card-grad p-5 shadow-card">
            <h2 className="font-display text-xl font-bold">2. SMTP profile</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Only TLS submission ports 465 and 587 are supported. Passwords and app passwords are
              write-only.
            </p>
            <form onSubmit={createRelay} className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Profile label">
                <input
                  required
                  value={profile.label}
                  onChange={(event) => setProfile({ ...profile, label: event.target.value })}
                  className="field"
                  placeholder="Postmark production"
                />
              </Field>
              <Field label="Verified sending domain">
                <select
                  required
                  value={profile.domainId}
                  onChange={(event) => setProfile({ ...profile, domainId: event.target.value })}
                  className="field"
                >
                  <option value="">Choose a verified domain</option>
                  {verifiedDomains.map((domain) => (
                    <option key={domain.id} value={domain.id}>
                      {domain.domain}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="SMTP hostname">
                <input
                  required
                  value={profile.host}
                  onChange={(event) => setProfile({ ...profile, host: event.target.value })}
                  className="field"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="smtp.provider.example"
                />
              </Field>
              <Field label="Submission security">
                <select
                  value={`${profile.port}:${profile.tlsMode}`}
                  onChange={(event) => {
                    const [port, tlsMode] = event.target.value.split(":") as [
                      "465" | "587",
                      "implicit_tls" | "starttls",
                    ];
                    setProfile({ ...profile, port, tlsMode });
                  }}
                  className="field"
                >
                  <option value="587:starttls">587 · STARTTLS required</option>
                  <option value="465:implicit_tls">465 · implicit TLS required</option>
                </select>
              </Field>
              <Field label="SMTP username">
                <input
                  required
                  autoComplete="username"
                  value={profile.username}
                  onChange={(event) => setProfile({ ...profile, username: event.target.value })}
                  className="field"
                />
              </Field>
              <Field label="Password or app password">
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  value={profile.password}
                  onChange={(event) => setProfile({ ...profile, password: event.target.value })}
                  className="field"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Stored encrypted by the service. It is never displayed, copied, or returned to
                  this page.
                </p>
              </Field>
              <Field label="Forwarding identity local part">
                <input
                  required
                  value={profile.identityLocalPart}
                  onChange={(event) =>
                    setProfile({ ...profile, identityLocalPart: event.target.value })
                  }
                  className="field"
                  placeholder="forward"
                />
              </Field>
              <Field label="Bounce SPF include">
                <input
                  required
                  value={profile.bounceSpfInclude}
                  onChange={(event) =>
                    setProfile({ ...profile, bounceSpfInclude: event.target.value })
                  }
                  className="field"
                  placeholder="include:provider.example"
                />
              </Field>
              <Field label="SMTP auth method">
                <select
                  value={profile.authMethod}
                  onChange={(event) =>
                    setProfile({ ...profile, authMethod: event.target.value as "plain" | "login" })
                  }
                  className="field"
                >
                  <option value="plain">PLAIN</option>
                  <option value="login">LOGIN</option>
                </select>
              </Field>
              <div className="flex items-end">
                <button
                  disabled={submitting || verifiedDomains.length === 0}
                  className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Store profile
                </button>
              </div>
            </form>
          </section>

          {selectedRelay && (
            <RelayDetail
              relay={selectedRelay}
              recipients={verifiedRecipients}
              aliases={aliases}
              events={events}
              testRecipientId={testRecipientId}
              setTestRecipientId={setTestRecipientId}
              confirmation={confirmation}
              setConfirmation={setConfirmation}
              rotation={rotation}
              setRotation={setRotation}
              acknowledgeNoFallback={acknowledgeNoFallback}
              setAcknowledgeNoFallback={setAcknowledgeNoFallback}
              destructiveConfirmed={destructiveConfirmed}
              setDestructiveConfirmed={setDestructiveConfirmed}
              submitting={submitting}
              onTest={runTest}
              onConfirm={confirmTest}
              onRotate={rotateCredentials}
              onAssign={assignAlias}
              onUnassign={unassignAlias}
              onState={setRelayState}
              onDelete={deleteRelay}
            />
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-border bg-card-grad p-5 shadow-card">
            <h2 className="font-display text-lg font-bold">Relay profiles</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every profile is bound to one verified domain.
            </p>
            {relays.length === 0 ? (
              <p className="mt-5 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                No profile yet. Complete steps 1 and 2 to begin.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {relays.map((relay) => (
                  <button
                    key={relay.id}
                    onClick={() => setSelectedId(relay.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${relay.id === selectedId ? "border-accent bg-accent/10" : "border-border bg-surface hover:bg-surface-2"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{relay.label}</span>
                      <StatusBadge status={relay.status} />
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {relay.host}:{relay.port}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </section>
          <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5">
            <Clock3 className="h-5 w-5 text-amber-300" />
            <h2 className="mt-3 font-semibold">What tests prove</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              DNS, TLS, and SMTP authentication are checked before a test is submitted. Submission
              is not confirmed delivery. Only the token received at your verified recipient marks
              the relay ready.
            </p>
          </section>
        </aside>
      </section>
    </main>
  );
}

function RelayDetail({
  relay,
  recipients,
  aliases,
  events,
  testRecipientId,
  setTestRecipientId,
  confirmation,
  setConfirmation,
  rotation,
  setRotation,
  acknowledgeNoFallback,
  setAcknowledgeNoFallback,
  destructiveConfirmed,
  setDestructiveConfirmed,
  submitting,
  onTest,
  onConfirm,
  onRotate,
  onAssign,
  onUnassign,
  onState,
  onDelete,
}: {
  relay: SmtpRelay;
  recipients: Recipient[];
  aliases: Alias[];
  events: SmtpRelayAuditEvent[];
  testRecipientId: string;
  setTestRecipientId: (value: string) => void;
  confirmation: { testId: string; token: string };
  setConfirmation: (value: { testId: string; token: string }) => void;
  rotation: CredentialDraft;
  setRotation: (value: CredentialDraft) => void;
  acknowledgeNoFallback: boolean;
  setAcknowledgeNoFallback: (value: boolean) => void;
  destructiveConfirmed: boolean;
  setDestructiveConfirmed: (value: boolean) => void;
  submitting: boolean;
  onTest: (relay: SmtpRelay, recipientId: string) => Promise<void>;
  onConfirm: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onRotate: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onAssign: (alias: Alias) => Promise<void>;
  onUnassign: (alias: Alias) => Promise<void>;
  onState: (action: "enable" | "disable" | "revoke") => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const checks = relayCheckRows(relay.status, relay.lastOutcomeCode);
  const matchingAliases = aliases.filter((alias) => alias.domainId === relay.domainId);
  const ready = canAssignCustomRelay(relay.status, relay.circuitStatus);
  const retryDeadline = relay.queue.retryDeadline
    ? date(relay.queue.retryDeadline)
    : "No retry scheduled";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card-grad p-5 shadow-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-bold">{relay.label}</h2>
              <StatusBadge status={relay.status} />
            </div>
            <p className="mt-2 font-mono text-sm text-muted-foreground">
              {relay.identityLocalPart} · {relay.host}:{relay.port} ·{" "}
              {relay.tlsMode === "starttls" ? "STARTTLS" : "implicit TLS"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <Metric label="Queue" value={String(relay.queue.queued)} />
            <Metric label="Circuit" value={relay.circuitStatus.replace("_", " ")} />
            <Metric label="Retry deadline" value={retryDeadline} />
            <Metric label="Last code" value={relay.lastOutcomeCode ?? "—"} />
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Last test: {date(relay.lastTestedAt)}. The platform fallback is off for aliases assigned
          to this relay.
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card-grad p-5 shadow-card">
        <h2 className="font-display text-xl font-bold">3. Automated checks and test message</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {checks.map((check) => (
            <div
              key={check.label}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-sm"
            >
              <CheckIcon state={check.state} />
              <div>
                <p className="font-semibold">{check.label}</p>
                <p className="text-xs text-muted-foreground">
                  {check.state === "running"
                    ? check.code === "smtp_submitted"
                      ? "submitted; awaiting recipient confirmation"
                      : "in progress"
                    : check.state === "failed"
                      ? check.code?.replaceAll("_", " ")
                      : check.state}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Verified test recipient">
            <select
              value={testRecipientId}
              onChange={(event) => setTestRecipientId(event.target.value)}
              className="field"
            >
              <option value="">Select your verified recipient</option>
              {recipients.map((recipient) => (
                <option key={recipient.id} value={recipient.id}>
                  {recipient.email}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              The server validates recipient ownership; there is no free-form destination.
            </p>
          </Field>
          <div className="flex items-end">
            <button
              onClick={() => void onTest(relay, testRecipientId)}
              disabled={
                submitting ||
                recipients.length === 0 ||
                ["disabled", "revoked"].includes(relay.status)
              }
              className="w-full rounded-lg border border-accent px-4 py-2.5 text-sm font-bold text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Run checks and submit test
            </button>
          </div>
        </div>
        {confirmation.testId && (
          <form
            onSubmit={onConfirm}
            className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
          >
            <p className="font-semibold text-amber-200">Confirm delivery from the verified inbox</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter the token from the test message. Do not treat SMTP submission as delivery
              confirmation.
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                required
                value={confirmation.token}
                onChange={(event) =>
                  setConfirmation({ ...confirmation, token: event.target.value })
                }
                className="field flex-1"
                placeholder="Confirmation token"
              />
              <button
                disabled={submitting}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                Confirm delivery
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card-grad p-5 shadow-card">
        <h2 className="font-display text-xl font-bold">4. Alias assignment</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Only aliases you own on this relay’s verified domain appear here. Assignment is
          unavailable until the relay is ready and its circuit is closed.
        </p>
        <label className="mt-4 flex items-start gap-3 rounded-xl border border-rose-500/25 bg-rose-500/5 p-4 text-sm">
          <input
            type="checkbox"
            checked={acknowledgeNoFallback}
            onChange={(event) => setAcknowledgeNoFallback(event.target.checked)}
            className="mt-1 h-4 w-4 accent-rose-500"
          />
          <span>
            <strong className="text-foreground">I understand the consequences.</strong> A
            custom-routed alias uses this relay only. If it fails, messages queue and retry or fail
            closed; ShieldMe will not silently use platform delivery.
          </span>
        </label>
        <div className="mt-4 divide-y divide-border rounded-xl border border-border">
          {matchingAliases.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No owned aliases match this relay’s domain.
            </p>
          ) : (
            matchingAliases.map((alias) => {
              const assigned =
                alias.outboundMode === "custom_smtp" && alias.smtpRelayId === relay.id;
              return (
                <div
                  key={alias.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-mono text-sm">
                      {alias.localPart}@{alias.domain?.domain}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {assigned ? "Custom relay · platform fallback off" : "Platform forwarding"}
                    </p>
                  </div>
                  {assigned ? (
                    <button
                      disabled={submitting}
                      onClick={() => void onUnassign(alias)}
                      className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-surface-2 disabled:opacity-50"
                    >
                      Unassign relay
                    </button>
                  ) : (
                    <button
                      disabled={submitting || !ready || !acknowledgeNoFallback}
                      onClick={() => void onAssign(alias)}
                      className="rounded-lg bg-accent px-3 py-2 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Assign fail-closed relay
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card-grad p-5 shadow-card">
          <h2 className="font-display text-xl font-bold">5. Rotation and health</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Rotation stages new write-only credentials and requires another confirmed test before
            switching.
          </p>
          <form onSubmit={onRotate} className="mt-4 space-y-3">
            <input
              required
              autoComplete="username"
              value={rotation.username}
              onChange={(event) => setRotation({ ...rotation, username: event.target.value })}
              className="field"
              placeholder="New SMTP username"
            />
            <input
              required
              type="password"
              autoComplete="new-password"
              value={rotation.password}
              onChange={(event) => setRotation({ ...rotation, password: event.target.value })}
              className="field"
              placeholder="New password or app password"
            />
            <select
              required
              value={rotation.recipientId}
              onChange={(event) => setRotation({ ...rotation, recipientId: event.target.value })}
              className="field"
            >
              <option value="">Verified test recipient</option>
              {recipients.map((recipient) => (
                <option key={recipient.id} value={recipient.id}>
                  {recipient.email}
                </option>
              ))}
            </select>
            <button
              disabled={submitting || recipients.length === 0}
              className="w-full rounded-lg border border-accent px-4 py-2.5 text-sm font-bold text-accent hover:bg-accent/10 disabled:opacity-50"
            >
              Stage and test new credentials
            </button>
          </form>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              disabled={submitting || relay.status === "active"}
              onClick={() => void onState("enable")}
              className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-surface-2 disabled:opacity-50"
            >
              Enable
            </button>
            <button
              disabled={submitting || relay.status === "disabled"}
              onClick={() => void onState("disable")}
              className="rounded-lg border border-amber-500/40 px-3 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
            >
              Disable kill switch
            </button>
            <button
              disabled={submitting || relay.status === "revoked"}
              onClick={() => void onState("revoke")}
              className="col-span-2 rounded-lg border border-rose-500/40 px-3 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
            >
              Revoke credentials
            </button>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card-grad p-5 shadow-card">
          <h2 className="font-display text-xl font-bold">Audit history</h2>
          <div className="mt-4 space-y-3">
            {events.length ? (
              events.map((event) => (
                <div key={event.id} className="border-l-2 border-accent/50 pl-3">
                  <p className="text-sm font-semibold">
                    {event.action.replace("smtp_relay.", "").replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{date(event.timestamp)}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No relay audit events are available yet.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-rose-500/25 bg-rose-500/5 p-5">
        <div className="flex items-start gap-3">
          <Trash2 className="mt-0.5 h-5 w-5 text-rose-300" />
          <div className="flex-1">
            <h2 className="font-display text-lg font-bold">Delete relay</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Deletion is blocked until every alias is unassigned. It permanently removes stored
              relay credentials.
            </p>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={destructiveConfirmed}
                onChange={(event) => setDestructiveConfirmed(event.target.checked)}
                className="h-4 w-4 accent-rose-500"
              />
              I have unassigned affected aliases and understand this cannot be undone.
            </label>
            <button
              disabled={submitting || !destructiveConfirmed}
              onClick={() => void onDelete()}
              className="mt-4 rounded-lg bg-rose-500 px-4 py-2 text-sm font-bold text-white hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Delete this relay
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-foreground">
      <span>{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-2 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 max-w-28 truncate text-xs font-semibold text-foreground" title={value}>
        {value}
      </p>
    </div>
  );
}
function CheckIcon({ state }: { state: "passed" | "failed" | "running" | "pending" }) {
  if (state === "passed") return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />;
  if (state === "failed") return <XCircle className="h-5 w-5 shrink-0 text-rose-400" />;
  if (state === "running")
    return <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-amber-300" />;
  return <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />;
}
