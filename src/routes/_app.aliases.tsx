import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  aliasesApi,
  aliasesPgpApi,
  domainsApi,
  recipientsApi,
  ApiError,
  type Alias,
} from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import {
  Plus,
  Trash2,
  Copy,
  CheckCircle2,
  Search,
  ArrowDownUp,
  Mail,
  ShieldOff,
  Calendar,
  Users,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Tags,
} from "lucide-react";

export const Route = createFileRoute("/_app/aliases")({ component: AliasesPage });

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
      title="Copy alias"
    >
      {copied ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function PgpModeBadge({ mode }: { mode: string | undefined }) {
  if (!mode || mode === "none") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-muted-foreground border border-border">
              <ShieldOff className="h-3 w-3" />
              No PGP
            </span>
          </TooltipTrigger>
          <TooltipContent>
            None — forwarded mail is not encrypted. Add a PGP key to the recipient and set PGP mode
            to Optional or Required to enable encryption.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              mode === "required"
                ? "bg-accent/20 text-accent border border-accent/30"
                : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
            }`}
          >
            {mode === "required" ? (
              <ShieldCheck className="h-3 w-3" />
            ) : (
              <Shield className="h-3 w-3" />
            )}
            {mode === "required" ? "PGP required" : "PGP optional"}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {mode === "required"
            ? "Required — forwarded mail is always encrypted. If the recipient has no valid PGP key, the message is rejected (never sent as plaintext)."
            : "Optional — encrypts forwarded mail when the recipient has a PGP key; falls back to plaintext if no key is set."}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function CreateAliasDialog() {
  const [open, setOpen] = useState(false);
  const [localPart, setLocalPart] = useState("");
  const [domainId, setDomainId] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [pgpMode, setPgpMode] = useState<"none" | "optional" | "required">("none");
  const [error, setError] = useState("");
  const qc = useQueryClient();
  const { data: domsData } = useQuery({ queryKey: ["domains"], queryFn: () => domainsApi.list() });
  const { data: recData } = useQuery({
    queryKey: ["recipients"],
    queryFn: () => recipientsApi.list(),
  });
  const domains = (domsData?.domains ?? []).filter((d) => d.status === "verified");
  const recipients = (recData?.recipients ?? []).filter((r) => r.status === "verified");
  const mut = useMutation({
    mutationFn: () => aliasesApi.create(localPart, domainId, recipientId),
    onSuccess: (data) => {
      // If pgpMode != none, patch immediately after create
      if (pgpMode !== "none") {
        aliasesPgpApi.setPgpMode(data.alias.id, pgpMode).catch(() => {});
      }
      qc.invalidateQueries({ queryKey: ["aliases"] });
      qc.invalidateQueries({ queryKey: ["alias-stats"] });
      setOpen(false);
      setLocalPart("");
      setDomainId("");
      setRecipientId("");
      setPgpMode("none");
    },
    onError: (e) => {
      const message = e instanceof ApiError ? e.message : "Failed to create alias";
      setError(
        message.toLowerCase().includes("already exists") ||
          message.toLowerCase().includes("reserved")
          ? message + ". Please choose a different alias name."
          : message,
      );
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 rounded-xl bg-accent text-primary-foreground shadow-md hover:bg-accent/90">
          <Plus className="h-4 w-4" />
          Create new alias
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border bg-surface">
        <DialogHeader>
          <DialogTitle>Create alias</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            mut.mutate();
          }}
          className="space-y-4"
        >
          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="space-y-1.5">
            <Label>Local part</Label>
            <Input
              placeholder="shopping"
              value={localPart}
              onChange={(e) => setLocalPart(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">The part before the @ symbol</p>
          </div>
          <div className="space-y-1.5">
            <Label>Domain</Label>
            {domains.length === 0 ? (
              <p className="text-xs text-muted-foreground">No verified domains available.</p>
            ) : (
              <Select value={domainId} onValueChange={setDomainId}>
                <SelectTrigger className="border-border bg-surface">
                  <SelectValue placeholder="Select domain" />
                </SelectTrigger>
                <SelectContent className="border-border bg-surface">
                  {domains.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.domain}
                      {d.isShared ? " — shared" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Forward to</Label>
            {recipients.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No verified recipients. Add and verify one first.
              </p>
            ) : (
              <Select value={recipientId} onValueChange={setRecipientId}>
                <SelectTrigger className="border-border bg-surface">
                  <SelectValue placeholder="Select recipient" />
                </SelectTrigger>
                <SelectContent className="border-border bg-surface">
                  {recipients.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>PGP encryption mode</Label>
            <Select value={pgpMode} onValueChange={(v) => setPgpMode(v as typeof pgpMode)}>
              <SelectTrigger className="border-border bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-border bg-surface">
                <SelectItem value="none">None — forward as-is</SelectItem>
                <SelectItem value="optional">Optional — encrypt if key exists</SelectItem>
                <SelectItem value="required">Required — reject if no key</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {pgpMode === "none" && "Emails are forwarded without encryption."}
              {pgpMode === "optional" &&
                "Emails are encrypted when the recipient has a PGP key, otherwise forwarded plaintext."}
              {pgpMode === "required" &&
                "Emails are rejected if the recipient has no PGP key configured."}
            </p>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={mut.isPending || domains.length === 0 || recipients.length === 0}
          >
            {mut.isPending ? "Creating..." : "Create alias"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PgpModeSelector({ alias }: { alias: Alias }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (mode: "none" | "optional" | "required") =>
      aliasesPgpApi.setPgpMode(alias.id, mode),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aliases"] }),
  });
  return (
    <Select
      value={alias.pgpMode ?? "none"}
      onValueChange={(v) => mut.mutate(v as "none" | "optional" | "required")}
      disabled={mut.isPending}
    >
      <SelectTrigger className="h-7 w-36 border-border bg-surface text-xs px-2">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-border bg-surface">
        <SelectItem value="none">PGP: None</SelectItem>
        <SelectItem value="optional">PGP: Optional</SelectItem>
        <SelectItem value="required">PGP: Required</SelectItem>
      </SelectContent>
    </Select>
  );
}

function AliasCard({
  alias,
  stats,
}: {
  alias: Alias;
  stats?: {
    forwarded: number;
    blocked: number;
    failed: number;
    spamTagged?: number;
    spamRejected?: number;
    spamQuarantined?: number;
  };
}) {
  const qc = useQueryClient();
  const isActive = alias.status === "active";
  const address = alias.domain ? alias.localPart + "@" + alias.domain.domain : alias.localPart;
  const recipientEmail = alias.recipient?.email;
  const createdDate = new Date(alias.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const forwarded = stats?.forwarded ?? 0;
  const blocked = stats?.blocked ?? 0;
  const failed = stats?.failed ?? 0;
  const spamTagged = stats?.spamTagged ?? 0;
  const spamRejected = stats?.spamRejected ?? 0;
  const spamQuarantined = stats?.spamQuarantined ?? 0;
  const spamDetected = spamTagged + spamRejected + spamQuarantined;

  const toggleMut = useMutation({
    mutationFn: (enable: boolean) =>
      enable ? aliasesApi.enable(alias.id) : aliasesApi.disable(alias.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aliases"] }),
  });
  const deleteMut = useMutation({
    mutationFn: () => aliasesApi.remove(alias.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["aliases"] });
      qc.invalidateQueries({ queryKey: ["alias-stats"] });
    },
  });

  return (
    <div className="rounded-xl border border-border bg-card-grad p-5 shadow-card transition-shadow hover:shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Switch
            checked={isActive}
            onCheckedChange={(v) => toggleMut.mutate(v)}
            disabled={toggleMut.isPending}
            className="mt-1"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold">{address}</span>
              <PgpModeBadge mode={alias.pgpMode} />
            </div>
            {recipientEmail && (
              <span className="mt-0.5 block text-xs text-muted-foreground">→ {recipientEmail}</span>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {createdDate}
              </span>
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3 w-3" />
                Forwarded: <strong className="text-foreground">{forwarded}</strong>
              </span>
              <span className="inline-flex items-center gap-1">
                <ShieldOff className="h-3 w-3" />
                Blocked: <strong className="text-foreground">{blocked}</strong>
              </span>
              {failed > 0 && (
                <span className="inline-flex items-center gap-1 text-orange-300">
                  <ShieldAlert className="h-3 w-3" />
                  Failures: <strong className="text-orange-200">{failed}</strong>
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <ShieldAlert className="h-3 w-3" />
                Spam: <strong className="text-foreground">{spamDetected}</strong>
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {failed > 0 && (
            <a
              href="/failed-deliveries"
              className="inline-flex items-center gap-1 rounded-lg border border-orange-500/20 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-300"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              {failed} delivery failure{failed === 1 ? "" : "s"}
            </a>
          )}
          {spamDetected > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300"
              title={`${spamTagged} tagged, ${spamRejected} rejected, ${spamQuarantined} quarantined`}
            >
              <Tags className="h-3.5 w-3.5" />
              {spamTagged} tagged · {spamRejected + spamQuarantined} blocked
            </span>
          )}
          <PgpModeSelector alias={alias} />
          <CopyButton text={address} />
          {recipientEmail && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <Users className="h-3.5 w-3.5" />1
            </span>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-lg border border-border bg-surface px-2 py-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="border-border bg-surface">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete alias?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete {address}. Emails sent to this address will no longer
                  be forwarded.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMut.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

export function AliasesPage() {
  const { data, isLoading } = useQuery({ queryKey: ["aliases"], queryFn: () => aliasesApi.list() });
  const { data: statsData } = useQuery({
    queryKey: ["alias-stats"],
    queryFn: () => aliasesApi.stats(),
  });
  const aliases = useMemo(() => data?.aliases ?? [], [data?.aliases]);
  const perAlias = useMemo(() => statsData?.perAlias ?? {}, [statsData?.perAlias]);

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "most-forwarded">("newest");

  const filtered = useMemo(() => {
    let list = aliases.filter((a) => {
      if (!search) return true;
      const address = a.domain ? a.localPart + "@" + a.domain.domain : a.localPart;
      return (
        address.toLowerCase().includes(search.toLowerCase()) ||
        (a.recipient?.email ?? "").toLowerCase().includes(search.toLowerCase())
      );
    });
    list = [...list].sort((a, b) => {
      if (sortBy === "newest")
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === "oldest")
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === "most-forwarded")
        return (perAlias[b.id]?.forwarded ?? 0) - (perAlias[a.id]?.forwarded ?? 0);
      return 0;
    });
    return list;
  }, [aliases, search, sortBy, perAlias]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-2xl font-bold">Aliases</h1>
        <CreateAliasDialog />
      </div>

      <div className="mb-4 rounded-2xl border border-accent/20 bg-surface/45 p-5 text-sm text-muted-foreground shadow-card">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-accent" />
          PGP-encrypted mailbox delivery is available on every plan
        </div>
        <p className="mt-2">
          OpenPGP forwarding uses your recipient public key to encrypt messages before delivery.
          ShieldMail never needs your private key; keep it in your mail app or browser extension so
          only you can decrypt protected mail.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface/55 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-accent">Step 1</div>
            <div className="mt-1 font-medium text-foreground">Create your key</div>
            <p className="mt-1 text-xs">
              Install FlowCrypt in Gmail, choose “New encryption key”, set a strong passphrase, and
              keep the private key inside FlowCrypt.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface/55 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-accent">Step 2</div>
            <div className="mt-1 font-medium text-foreground">Add the public key</div>
            <p className="mt-1 text-xs">
              Copy only the public key block from FlowCrypt, open Recipients in ShieldMail, and
              paste it into that recipient’s PGP public key field.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface/55 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-accent">Step 3</div>
            <div className="mt-1 font-medium text-foreground">Turn it on per alias</div>
            <p className="mt-1 text-xs">
              Set alias PGP mode to Optional or Required. Encrypted mail arrives in Gmail and
              FlowCrypt decrypts it with your private key/passphrase.
            </p>
          </div>
        </div>
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search aliases..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-surface border-border"
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-48 border-border bg-surface">
            <div className="flex items-center gap-2">
              <ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent className="border-border bg-surface">
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="most-forwarded">Most forwarded</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isLoading && <p className="text-muted-foreground">Loading...</p>}
      {!isLoading && aliases.length === 0 && (
        <div className="rounded-xl border border-border bg-card-grad p-10 text-center text-muted-foreground">
          No aliases yet. Create your first alias to start protecting your inbox.
        </div>
      )}
      {filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((a) => (
            <AliasCard key={a.id} alias={a} stats={perAlias[a.id]} />
          ))}
        </div>
      )}
      {!isLoading && aliases.length > 0 && filtered.length === 0 && (
        <div className="rounded-xl border border-border bg-card-grad p-10 text-center text-muted-foreground">
          No aliases match your search.
        </div>
      )}
    </div>
  );
}
