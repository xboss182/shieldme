import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Ban, Mail, Plus, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
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
  SelectInput,
  TextInput,
  Toggle,
} from "@/components/ui-kit";
import {
  useAliases,
  useAliasStats,
  useCreateAlias,
  useDeleteAlias,
  useDomains,
  useRecipients,
  useSetAliasPgp,
  useToggleAlias,
  useVerificationCode,
  formatDate,
  type PgpMode,
  type Alias,
} from "@/lib/api";

export const Route = createFileRoute("/aliases")({
  head: () => ({
    meta: [
      { title: "Aliases — ShieldMail" },
      {
        name: "description",
        content: "Create, disable, and encrypt every ShieldMail alias and its forwarding target.",
      },
      { property: "og:title", content: "Aliases — ShieldMail" },
      {
        property: "og:description",
        content: "Create, disable, and encrypt every ShieldMail alias and its forwarding target.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AliasesPage,
});

const PGP_LABEL: Record<PgpMode, string> = {
  none: "No PGP",
  optional: "PGP optional",
  required: "PGP required",
};

const PGP_HELP: Record<PgpMode, string> = {
  none: "Mail is forwarded as-is. Fastest, no key required.",
  optional: "Encrypted when the recipient has a valid key, plaintext otherwise.",
  required: "Mail is rejected if the recipient has no usable key. Strictest.",
};

function randomSuffix() {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function AliasesPage() {
  const { data: aliases, isLoading, isError, error } = useAliases();
  const { data: stats } = useAliasStats();
  const { data: domains } = useDomains();
  const { data: recipients } = useRecipients();

  const createAlias = useCreateAlias();
  const toggleAlias = useToggleAlias();
  const setPgp = useSetAliasPgp();
  const deleteAlias = useDeleteAlias();
  const revealCode = useVerificationCode();

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [pgpFilter, setPgpFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Alias | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealError, setRevealError] = useState<Record<string, string>>({});

  const verifiedDomains = (domains ?? []).filter((d) => d.status === "verified");
  const verifiedRecipients = (recipients ?? []).filter((r) => r.status === "verified");

  const [label, setLabel] = useState("");
  const [localPart, setLocalPart] = useState(`alias.${randomSuffix()}`);
  const [domainId, setDomainId] = useState(verifiedDomains[0]?.id ?? "");
  const [recipientId, setRecipientId] = useState(verifiedRecipients[0]?.id ?? "");
  const [pgpMode, setPgpMode] = useState<PgpMode>("optional");

  const statsFor = (id: string) =>
    stats?.perAlias?.[id] ?? {
      forwarded: 0,
      blocked: 0,
      failed: 0,
      spamTagged: 0,
      spamRejected: 0,
    };

  const list = useMemo(() => aliases ?? [], [aliases]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = list.filter(
      (a) =>
        !q ||
        `${a.localPart}@${a.domain.domain}`.toLowerCase().includes(q) ||
        a.recipient.email.toLowerCase().includes(q),
    );
    if (pgpFilter !== "all") out = out.filter((a) => a.pgpMode === pgpFilter);
    return [...out].sort((a, b) => {
      if (sort === "forwarded")
        return (
          (stats?.perAlias?.[b.id]?.forwarded ?? 0) - (stats?.perAlias?.[a.id]?.forwarded ?? 0)
        );
      const da = new Date(a.createdAt).getTime();
      const db = new Date(b.createdAt).getTime();
      return sort === "oldest" ? da - db : db - da;
    });
  }, [list, query, sort, pgpFilter, stats]);

  const activeCount = list.filter((a) => a.status === "active").length;
  const pgpRequired = list.filter((a) => a.pgpMode === "required").length;

  function handleCreate() {
    if (!domainId || !recipientId) return;
    createAlias.mutate(
      { localPart, domainId, recipientId, pgpMode },
      {
        onSuccess: () => {
          setCreateOpen(false);
          setLabel("");
          setLocalPart(`alias.${randomSuffix()}`);
        },
      },
    );
  }

  function handleReveal(alias: Alias) {
    if (revealed[alias.id]) return;
    revealCode.mutate(alias.id, {
      onSuccess: (r) => setRevealed((m) => ({ ...m, [alias.id]: r.verificationCode })),
      onError: () =>
        setRevealError((m) => ({
          ...m,
          [alias.id]: "Verification codes are disabled on this instance.",
        })),
    });
  }

  return (
    <AppShell
      eyebrow="Aliases"
      action={
        <Btn
          variant="primary"
          onClick={() => setCreateOpen(true)}
          className="text-sm py-2 px-3"
          disabled={!verifiedDomains.length || !verifiedRecipients.length}
        >
          <Plus className="size-3.5" /> Create alias
        </Btn>
      }
    >
      <div className="p-8 max-w-7xl w-full mx-auto">
        <PageHeader
          title="Aliases"
          description="Every address that fronts your real inbox. Toggle, re-route, or lock an alias to PGP without touching your provider."
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Summary label="Total" value={list.length} />
          <Summary label="Active" value={activeCount} tone="emerald" />
          <Summary label="Disabled" value={list.length - activeCount} />
          <Summary label="PGP required" value={pgpRequired} tone="brand" />
        </div>

        <details className="mb-6 bg-neutral-50 ring-1 ring-black/5 rounded-xl px-6 py-4 group">
          <summary className="text-sm font-medium cursor-pointer list-none flex items-center justify-between">
            PGP setup guide for Gmail
            <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">
              3 steps
            </span>
          </summary>
          <ol className="mt-4 space-y-3 text-sm text-neutral-500">
            <li>
              <span className="font-medium text-neutral-700">1. Install FlowCrypt</span> — add the
              browser extension and generate a key pair for your forwarding address.
            </li>
            <li>
              <span className="font-medium text-neutral-700">2. Export the public key</span> — copy
              the armored block beginning with{" "}
              <code className="font-mono text-xs">-----BEGIN PGP PUBLIC KEY BLOCK-----</code>.
            </li>
            <li>
              <span className="font-medium text-neutral-700">3. Upload it</span> — paste it on the{" "}
              <Link to="/recipients" className="text-brand hover:underline underline-offset-4">
                Recipients
              </Link>{" "}
              page, then switch aliases to PGP required.
            </li>
          </ol>
        </details>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <TextInput
            placeholder="Search address or recipient"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-xs"
          />
          <SelectInput value={sort} onChange={(e) => setSort(e.target.value)} className="w-40">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="forwarded">Most forwarded</option>
          </SelectInput>
          <SelectInput
            value={pgpFilter}
            onChange={(e) => setPgpFilter(e.target.value)}
            className="w-40"
          >
            <option value="all">All PGP modes</option>
            <option value="none">No PGP</option>
            <option value="optional">PGP optional</option>
            <option value="required">PGP required</option>
          </SelectInput>
          <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-neutral-400">
            {filtered.length} of {list.length} shown
          </span>
        </div>

        {isLoading ? (
          <Panel>
            <p className="py-10 text-center text-sm text-neutral-400">Loading aliases…</p>
          </Panel>
        ) : isError ? (
          <Panel>
            <p className="py-10 text-center text-sm text-rose-600">
              Couldn't load aliases: {error instanceof Error ? error.message : "unknown error"}
            </p>
          </Panel>
        ) : filtered.length === 0 ? (
          <Panel>
            <EmptyState
              title={list.length === 0 ? "No aliases yet" : "No aliases match your search"}
              description={
                list.length === 0
                  ? "Create your first alias to start shielding your real inbox."
                  : "Try a different address or PGP filter."
              }
            />
          </Panel>
        ) : (
          <div className="space-y-3">
            {filtered.map((a) => {
              const s = statsFor(a.id);
              const code = revealed[a.id];
              return (
                <div key={a.id} className="bg-neutral-50 ring-1 ring-black/5 rounded-xl p-5">
                  <div className="flex flex-wrap items-start gap-4">
                    <Toggle
                      checked={a.status === "active"}
                      label={`Toggle ${a.localPart}`}
                      onChange={(v) => toggleAlias.mutate({ id: a.id, enable: v })}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`font-mono text-sm font-medium ${
                            a.status === "active" ? "text-neutral-900" : "text-neutral-400"
                          }`}
                        >
                          {a.localPart}@{a.domain.domain}
                        </span>
                        <Chip tone={a.pgpMode === "required" ? "brand" : "neutral"}>
                          {PGP_LABEL[a.pgpMode]}
                        </Chip>
                        <CopyButton value={`${a.localPart}@${a.domain.domain}`} />
                      </div>
                      <p className="mt-1 text-xs text-neutral-400 flex items-center gap-1.5">
                        <ArrowRight className="size-3" />
                        <span>{a.recipient.email}</span>
                        <span className="text-neutral-300">
                          · created {formatDate(a.createdAt)}
                        </span>
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] font-mono text-neutral-500">
                        <Stat
                          icon={<Mail className="size-3" />}
                          label="Forwarded"
                          value={s.forwarded}
                        />
                        <Stat icon={<Ban className="size-3" />} label="Blocked" value={s.blocked} />
                        {s.failed > 0 ? (
                          <Link
                            to="/failed-deliveries"
                            className="inline-flex items-center gap-1.5 text-rose-600 hover:underline underline-offset-4"
                          >
                            <TriangleAlert className="size-3" />
                            Failures {s.failed}
                          </Link>
                        ) : (
                          <Stat
                            icon={<TriangleAlert className="size-3" />}
                            label="Failures"
                            value={0}
                          />
                        )}
                        <Stat
                          icon={<ShieldCheck className="size-3" />}
                          label="Spam"
                          value={s.spamTagged + s.spamRejected}
                        />
                        <span className="text-neutral-300">
                          {s.spamTagged} tagged · {s.spamRejected} rejected
                        </span>
                      </div>

                      {code ? (
                        <div className="mt-3 flex items-center gap-2 bg-white ring-1 ring-black/5 rounded-md px-2.5 py-1.5 w-fit">
                          <span className="font-mono text-xs">{code}</span>
                          <CopyButton value={code} label="Copy" />
                        </div>
                      ) : revealError[a.id] ? (
                        <p className="mt-3 text-xs text-neutral-400">{revealError[a.id]}</p>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      <SelectInput
                        aria-label={`PGP mode for ${a.localPart}`}
                        value={a.pgpMode}
                        onChange={(e) =>
                          setPgp.mutate({ id: a.id, pgpMode: e.target.value as PgpMode })
                        }
                        className="w-36 text-xs"
                      >
                        <option value="none">No PGP</option>
                        <option value="optional">PGP optional</option>
                        <option value="required">PGP required</option>
                      </SelectInput>
                      <Btn onClick={() => handleReveal(a)}>{code ? "Hide code" : "Show code"}</Btn>
                      <Btn variant="danger" onClick={() => setPendingDelete(a)}>
                        <Trash2 className="size-3.5" />
                      </Btn>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create alias"
        description="Aliases route inbound mail to a verified recipient."
      >
        <div className="space-y-4">
          <Field
            label="Service label"
            hint="Only you see this — it helps you find the alias later."
          >
            <TextInput
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Online shopping"
            />
          </Field>
          <Field label="Alias name">
            <div className="flex gap-2">
              <TextInput value={localPart} onChange={(e) => setLocalPart(e.target.value)} />
              <Btn onClick={() => setLocalPart(`alias.${randomSuffix()}`)}>Regenerate</Btn>
            </div>
          </Field>
          <Field label="Domain">
            <SelectInput value={domainId} onChange={(e) => setDomainId(e.target.value)}>
              {(verifiedDomains.length ? verifiedDomains : (domains ?? [])).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.domain}
                  {d.isShared ? " — shared" : ""}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Forward to">
            <SelectInput value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
              {(verifiedRecipients.length ? verifiedRecipients : (recipients ?? [])).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.email}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="PGP encryption" hint={PGP_HELP[pgpMode]}>
            <SelectInput value={pgpMode} onChange={(e) => setPgpMode(e.target.value as PgpMode)}>
              <option value="none">No PGP</option>
              <option value="optional">PGP optional</option>
              <option value="required">PGP required</option>
            </SelectInput>
          </Field>
          {createAlias.isError ? (
            <p className="text-xs text-rose-600">
              {createAlias.error instanceof Error ? createAlias.error.message : "Create failed"}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <Btn onClick={() => setCreateOpen(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={handleCreate} disabled={createAlias.isPending}>
              {createAlias.isPending ? "Creating…" : "Create alias"}
            </Btn>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteAlias.mutate(pendingDelete.id);
        }}
        title="Delete this alias?"
        description={`Mail sent to ${pendingDelete?.localPart}@${pendingDelete?.domain?.domain} will bounce immediately. This cannot be undone.`}
      />
    </AppShell>
  );
}

function Summary({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "emerald" | "brand";
}) {
  const cls =
    tone === "emerald" ? "text-emerald-600" : tone === "brand" ? "text-brand" : "text-neutral-900";
  return (
    <div className="bg-neutral-50 ring-1 ring-black/5 rounded-xl p-4">
      <p className="text-[11px] font-medium text-neutral-400 uppercase">{label}</p>
      <p className={`mt-1 text-xl font-mono ${cls}`}>{String(value).padStart(2, "0")}</p>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      {label} <span className="text-neutral-900">{value}</span>
    </span>
  );
}
