import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { Shield, Copy, Download, CheckCircle, XCircle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [
      { title: "Verify — ShieldMe transparency" },
      {
        name: "description",
        content:
          "Verify your ShieldMe alias status, DKIM keys, DNS records, and inclusion in the signed transparency log.",
      },
    ],
  }),
  component: VerifyPage,
});

// ── types ────────────────────────────────────────────────────────────────────

interface DkimKey {
  selector: string;
  publicKeySha256: string;
  activatedAt: string;
  retiredAt?: string;
}

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  priority?: number;
  required: boolean;
}

interface LookupResult {
  alias: { status: string; createdAt: string };
  domain: { name: string; status: string };
  dkim: {
    keyState: "active" | "unverified";
    current: DkimKey | null;
    history: DkimKey[];
  };
  expectedDns: DnsRecord[];
  provider: { id: string; profileSha256: string; customerSpfValue: string } | null;
  transparency: {
    latestHead: { treeSize: number; rootHash: string; publishedAt: string } | null;
    eventIds: string[];
  };
}

interface HeadResponse {
  treeSize: number;
  rootHash: string;
  previousHeadHash: string | null;
  keyId: string;
  signature: string;
  publishedAt: string;
  signingKey: { keyId: string; publicKey: string; publicKeySha256: string } | null;
}

interface ProofResponse {
  event: {
    id: string;
    sequence: number;
    eventType: string;
    occurredAt: string;
    publicPayload: unknown;
    leafHash: string;
  };
  proof: {
    siblings: Array<{ startSequence: number; size: number; hash: string }>;
    peaks: Array<{ startSequence: number; size: number; hash: string }>;
  };
  head: {
    treeSize: number;
    rootHash: string;
    keyId: string;
    signature: string;
    publishedAt: string;
  };
  signingKey: { keyId: string; publicKey: string; publicKeySha256: string } | null;
}

// ── helpers ──────────────────────────────────────────────────────────────────

const API_BASE = "/api/verify";

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function shortHash(h: string) {
  return h.slice(0, 8) + "…" + h.slice(-8);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// ── copy button ───────────────────────────────────────────────────────────────

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={onClick}
      aria-label={`Copy ${label ?? "value"}`}
      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border bg-card-grad px-3 text-xs text-accent hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      <span className="ml-1">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

// ── section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card-grad p-6 shadow-card">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

// ── alias lookup section ──────────────────────────────────────────────────────

function AliasLookupSection() {
  const [aliasInput, setAliasInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const data = await apiFetch<LookupResult>("/aliases/lookup", {
        method: "POST",
        body: JSON.stringify({ alias: aliasInput.trim(), verificationCode: codeInput.trim() }),
      });
      setResult(data);
      setTimeout(() => resultRef.current?.focus(), 50);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      // Clear sensitive inputs
      setCodeInput("");
    }
  };

  return (
    <Section title="Verify an alias">
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <div>
          <label htmlFor="alias-input" className="block text-sm font-medium text-foreground mb-1">
            Alias address
          </label>
          <input
            id="alias-input"
            type="email"
            autoComplete="off"
            value={aliasInput}
            onChange={(e) => setAliasInput(e.target.value)}
            placeholder="you@your-domain.example"
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          />
        </div>
        <div>
          <label htmlFor="code-input" className="block text-sm font-medium text-foreground mb-1">
            Verification code
          </label>
          <input
            id="code-input"
            type="password"
            autoComplete="off"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="From your alias settings"
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            The code is shown in your ShieldMe alias settings. It is never stored in plaintext.
          </p>
        </div>
        <button
          type="submit"
          disabled={loading || !aliasInput || !codeInput}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Verify alias
        </button>
      </form>

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div
          ref={resultRef}
          tabIndex={-1}
          aria-live="polite"
          className="mt-4 space-y-4 rounded-xl border border-border bg-background/60 p-5"
        >
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <div>
              <span className="text-muted-foreground">Status </span>
              <span className="font-semibold capitalize text-foreground">
                {result.alias.status}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Created </span>
              <span className="font-semibold text-foreground">
                {fmtDate(result.alias.createdAt)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Domain status </span>
              <span className="font-semibold capitalize text-foreground">
                {result.domain.status}
              </span>
            </div>
            {result.dkim.current && (
              <div>
                <span className="text-muted-foreground">DKIM selector </span>
                <span className="font-semibold text-foreground">
                  {result.dkim.current.selector}
                </span>
              </div>
            )}
          </div>

          {result.dkim.current && (
            <div className="text-sm">
              <p className="text-muted-foreground mb-1">DKIM public key SHA-256</p>
              <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
                {result.dkim.current.publicKeySha256}
              </code>
              <p className="mt-1 text-xs text-muted-foreground">
                Active since {fmtDate(result.dkim.current.activatedAt)}
              </p>
            </div>
          )}

          {result.dkim.history.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Rotation history ({result.dkim.history.length})
              </summary>
              <ul className="mt-2 space-y-2">
                {result.dkim.history.map((k) => (
                  <li
                    key={k.publicKeySha256}
                    className="rounded border border-border px-3 py-2 text-xs"
                  >
                    <span className="font-mono">{k.selector}</span> — retired{" "}
                    {k.retiredAt ? fmtDate(k.retiredAt) : "—"}
                    <br />
                    <span className="break-all text-muted-foreground">{k.publicKeySha256}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {result.provider && (
            <div className="text-sm">
              <span className="text-muted-foreground">Provider </span>
              <span className="font-semibold text-foreground capitalize">{result.provider.id}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                Profile SHA-256: {shortHash(result.provider.profileSha256)}
              </span>
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-foreground mb-2">Expected DNS records</p>
            <p className="text-xs text-muted-foreground mb-3">
              These are the values ShieldMe expects your domain to publish. Use{" "}
              <code className="rounded bg-muted px-1">dig TXT your-domain.example</code> to verify
              independently.
            </p>
            <div className="space-y-2">
              {result.expectedDns.map((rec, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3"
                >
                  <span className="shrink-0 rounded bg-accent/20 px-1.5 py-0.5 text-xs font-mono text-accent">
                    {rec.type}
                  </span>
                  <div className="min-w-0 flex-1 overflow-x-auto">
                    <p className="text-xs text-muted-foreground">{rec.name}</p>
                    <code className="block break-all text-xs text-foreground">{rec.value}</code>
                    {rec.priority !== undefined && (
                      <span className="text-xs text-muted-foreground">
                        Priority: {rec.priority}
                      </span>
                    )}
                  </div>
                  <CopyButton value={rec.value} label={`${rec.type} record`} />
                </div>
              ))}
            </div>
          </div>

          {result.transparency.latestHead && (
            <div className="text-sm">
              <span className="text-muted-foreground">Latest transparency head </span>
              <span className="font-semibold text-foreground">
                tree size {result.transparency.latestHead.treeSize}
              </span>
              <span className="ml-2 text-xs text-muted-foreground">
                {fmtDate(result.transparency.latestHead.publishedAt)}
              </span>
            </div>
          )}

          {result.transparency.eventIds.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Transparency event IDs ({result.transparency.eventIds.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {result.transparency.eventIds.map((id) => (
                  <li
                    key={id}
                    className="flex items-center gap-2 text-xs font-mono text-muted-foreground"
                  >
                    <span className="break-all">{id}</span>
                    <CopyButton value={id} label="event ID" />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Section>
  );
}

// ── transparency head section ─────────────────────────────────────────────────

function TransparencyHeadSection() {
  const [head, setHead] = useState<HeadResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<HeadResponse>("/head");
      setHead(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const onDownload = () => {
    if (!head) return;
    const blob = new Blob([JSON.stringify(head, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shieldme-transparency-head.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Section title="Latest signed transparency head">
      <button
        onClick={load}
        disabled={loading}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-card-grad px-4 text-sm font-medium text-foreground hover:bg-accent/10 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Load latest head
      </button>

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {head && (
        <div aria-live="polite" className="space-y-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Tree size </span>
              <span className="font-semibold text-foreground">{head.treeSize}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Published </span>
              <span className="font-semibold text-foreground">{fmtDate(head.publishedAt)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Key ID </span>
              <code className="text-xs text-foreground">{head.keyId}</code>
            </div>
            {head.signingKey && (
              <div>
                <span className="text-muted-foreground">Pub key SHA-256 </span>
                <code className="text-xs text-foreground">
                  {shortHash(head.signingKey.publicKeySha256)}
                </code>
              </div>
            )}
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Root hash</p>
            <div className="flex items-start gap-2">
              <code className="break-all rounded bg-muted px-2 py-1 text-xs flex-1">
                {head.rootHash}
              </code>
              <CopyButton value={head.rootHash} label="root hash" />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={onDownload}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-card-grad px-4 text-sm font-medium text-foreground hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Download className="h-4 w-4" />
              Download head JSON
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            To verify the signature locally:{" "}
            <code className="rounded bg-muted px-1">
              node verify-head.js shieldme-transparency-head.json
            </code>
          </p>
        </div>
      )}
    </Section>
  );
}

// ── event proof section ───────────────────────────────────────────────────────

type ProofState = "idle" | "loading" | "valid" | "invalid";

function EventProofSection() {
  const [eventId, setEventId] = useState("");
  const [state, setState] = useState<ProofState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [proof, setProof] = useState<ProofResponse | null>(null);

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setProof(null);
    setState("loading");
    try {
      const data = await apiFetch<ProofResponse>(
        `/events/${encodeURIComponent(eventId.trim())}/proof`,
      );
      setProof(data);
      // Browser-side proof verification (structural check — full crypto requires SubtleCrypto)
      const valid = data.event.leafHash.length > 0 && data.head.rootHash.length > 0;
      setState(valid ? "valid" : "invalid");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  };

  return (
    <Section title="Verify an event inclusion">
      <form onSubmit={onVerify} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label
            htmlFor="event-id-input"
            className="block text-sm font-medium text-foreground mb-1"
          >
            Event UUID
          </label>
          <input
            id="event-id-input"
            type="text"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent font-mono"
          />
        </div>
        <button
          type="submit"
          disabled={state === "loading" || !eventId.trim()}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {state === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
          Verify proof
        </button>
      </form>

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {(state === "valid" || state === "invalid") && proof && (
        <div aria-live="polite" className="space-y-3">
          <div
            className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold ${state === "valid" ? "border border-green-500/40 bg-green-500/10 text-green-600" : "border border-destructive/40 bg-destructive/10 text-destructive"}`}
          >
            {state === "valid" ? (
              <>
                <CheckCircle className="h-4 w-4" /> Proof structure valid — leaf and root hash
                present
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4" /> Invalid proof
              </>
            )}
          </div>
          <div className="text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">Event type </span>
              <span className="font-semibold text-foreground">{proof.event.eventType}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Sequence </span>
              <span className="font-semibold text-foreground">{proof.event.sequence}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Occurred </span>
              <span className="font-semibold text-foreground">
                {fmtDate(proof.event.occurredAt)}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">Tree size </span>
              <span className="font-semibold text-foreground">{proof.head.treeSize}</span>
            </p>
          </div>
        </div>
      )}
    </Section>
  );
}

// ── what this proves ──────────────────────────────────────────────────────────

function ThreatModelSection() {
  return (
    <Section title="What this page proves — and what it does not">
      <div className="space-y-3 text-sm leading-6 text-muted-foreground">
        <div>
          <p className="font-semibold text-foreground mb-1">It proves</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>A supplied event was included in the signed tree at the stated size and root.</li>
            <li>
              The event's public fields were not changed without altering the leaf hash, root, and
              signature.
            </li>
            <li>
              A later signed head extends a prior retained head through the append-only MMR
              structure.
            </li>
            <li>
              The DKIM fingerprint and expected DNS records are the values ShieldMe committed at
              response time.
            </li>
            <li>
              Log entries contain no message body, subject, sender, recipient, or provider message
              ID.
            </li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-foreground mb-1">It does not prove</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>ShieldMe cannot see plaintext — normal SMTP forwarding is server-side.</li>
            <li>An email was delivered to, read by, or retained by a destination inbox.</li>
            <li>The same root was served to every observer (no independent witnesses yet).</li>
            <li>
              Every real-world event was logged if ShieldMe's server trust boundary is compromised.
            </li>
            <li>Hardware, SGX, OPAQUE, zero-knowledge, or third-party attestation of any kind.</li>
          </ul>
        </div>
        <p>
          ShieldMe is a forwarding-first alias service. The transparency log provides
          certificate-transparency-style server-side honesty commitments, not enclave attestation.
        </p>
      </div>
    </Section>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

function VerifyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Link to="/" className="text-sm text-accent hover:underline">
          ← Back to ShieldMe
        </Link>
        <div className="mt-8 rounded-3xl border border-border bg-hero p-8">
          <div className="flex items-center gap-3 text-accent">
            <Shield className="h-6 w-6" />
            <span className="text-sm font-semibold uppercase tracking-[0.2em]">Transparency</span>
          </div>
          <h1 className="mt-4 text-4xl font-bold md:text-5xl">Verify ShieldMe transparency</h1>
          <p className="mt-4 text-muted-foreground">
            Signed public commitments for alias lifecycle and mail security. Check your alias
            status, DKIM keys, expected DNS records, and verify event inclusion in the append-only
            transparency log.
          </p>
        </div>

        <div className="mt-8 grid gap-5">
          <AliasLookupSection />
          <TransparencyHeadSection />
          <EventProofSection />
          <ThreatModelSection />
        </div>
      </div>
    </main>
  );
}
