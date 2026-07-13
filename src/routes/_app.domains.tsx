import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { domainsApi, ApiError, type Domain, type DnsRecords } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
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
import { Plus, RefreshCw, Trash2, Copy, CheckCircle2, Clock, XCircle, Users } from "lucide-react";

export const Route = createFileRoute("/_app/domains")({ component: DomainsPage });

function statusBadge(s: Domain["status"]) {
  if (s === "verified")
    return <Badge className="bg-accent/20 text-accent border-accent/30">Verified</Badge>;
  if (s === "failed")
    return (
      <Badge variant="destructive">
        <XCircle className="h-3 w-3 mr-1" />
        Failed
      </Badge>
    );
  return (
    <Badge variant="secondary" className="gap-1">
      <Clock className="h-3 w-3" />
      Pending
    </Badge>
  );
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="shrink-0 text-muted-foreground hover:text-accent"
    >
      {copied ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function DnsRecord({
  type,
  name,
  value,
  priority,
  note,
}: {
  type: string;
  name?: string;
  value?: string;
  priority?: number;
  note?: string;
}) {
  if (!value) return null;
  return (
    <div className="rounded-lg border border-border bg-surface/40 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Record type</span>
        <span className="rounded bg-accent/15 px-2 py-0.5 text-accent normal-case tracking-normal">
          {type}
        </span>
        {priority !== undefined && (
          <span className="rounded bg-surface px-2 py-0.5 normal-case tracking-normal text-foreground/80">
            Priority {priority}
          </span>
        )}
      </div>
      <div className="grid gap-2 text-xs sm:grid-cols-[120px_1fr_auto] sm:items-start">
        <span className="font-semibold text-muted-foreground">Host / Name</span>
        <code className="break-all text-foreground">{name || "@"}</code>
        <CopyBtn value={name || "@"} />
        <span className="font-semibold text-muted-foreground">Value / Target</span>
        <code className="break-all text-foreground">{value}</code>
        <CopyBtn value={value} />
        {priority !== undefined && (
          <>
            <span className="font-semibold text-muted-foreground">Priority</span>
            <code className="break-all text-foreground">{priority}</code>
            <CopyBtn value={String(priority)} />
          </>
        )}
      </div>
      {note && <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{note}</p>}
    </div>
  );
}

function DnsRecordsPanel({ records }: { records: DnsRecords }) {
  return (
    <div className="mt-4 space-y-3">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Required DNS records
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Add these at your DNS provider, then click Verify. Use <strong>@</strong> if your provider
          asks for the root host/name. Do not create A records for SPF or DKIM — they are TXT
          records.
        </p>
      </div>
      <DnsRecord
        type="MX"
        name={records.mx?.name}
        value={records.mx?.value}
        priority={records.mx?.priority}
        note="Required for receiving mail. If your DNS provider has a Priority field, enter 10."
      />
      <DnsRecord
        type="TXT"
        name={records.txt?.name}
        value={records.txt?.value}
        note="Required to prove you control this domain."
      />
      <div className="pt-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Optional / deliverability records
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          These are not required for inbound forwarding verification, but can help if sending from
          this custom domain is enabled later.
        </p>
      </div>
      <DnsRecord type="TXT" name={records.spf?.name} value={records.spf?.value} />
      <DnsRecord type="TXT" name={records.dkim?.name} value={records.dkim?.value} />
      {records.dmarc && (
        <DnsRecord type="TXT" name={records.dmarc.name} value={records.dmarc.value} />
      )}
    </div>
  );
}

function AddDomainDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [domain, setDomain] = useState("");
  const [error, setError] = useState("");
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => domainsApi.add(domain),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domains"] });
      setOpen(false);
      setDomain("");
      onAdded();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Failed to add domain"),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add domain
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border bg-surface">
        <DialogHeader>
          <DialogTitle>Add domain</DialogTitle>
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
          <Input
            placeholder="example.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            required
          />
          <Button type="submit" className="w-full" disabled={mut.isPending}>
            {mut.isPending ? "Adding..." : "Add domain"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DomainCard({ domain }: { domain: Domain }) {
  const qc = useQueryClient();
  const [showDns, setShowDns] = useState(false);
  const dnsQuery = useQuery({
    queryKey: ["domain-dns", domain.id],
    queryFn: () => domainsApi.get(domain.id),
    enabled: showDns,
  });
  const verifyMut = useMutation({
    mutationFn: () => domainsApi.verify(domain.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["domains"] }),
  });
  const deleteMut = useMutation({
    mutationFn: () => domainsApi.remove(domain.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["domains"] }),
  });
  return (
    <div className="rounded-xl border border-border bg-card-grad p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-mono font-semibold">{domain.domain}</span>
          {domain.isShared && (
            <Badge className="gap-1 bg-blue-500/15 text-blue-300 border-blue-500/30">
              <Users className="h-3 w-3" />
              Shared
            </Badge>
          )}
          {statusBadge(domain.status)}
        </div>
        <div className="flex gap-2">
          {domain.isShared ? (
            <span className="rounded-lg border border-border bg-surface/50 px-3 py-1.5 text-xs text-muted-foreground">
              Ready to use — no DNS setup required
            </span>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setShowDns((v) => !v)}
              >
                {showDns ? "Hide DNS" : "Show DNS"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => verifyMut.mutate()}
                disabled={verifyMut.isPending}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {verifyMut.isPending ? "Checking..." : "Verify"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-border bg-surface">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete domain?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will delete {domain.domain} and may disable aliases using it.
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
            </>
          )}
        </div>
      </div>
      {verifyMut.data && (
        <div className="mt-3 rounded-lg bg-surface/40 px-3 py-2 text-xs">
          {verifyMut.data.verified ? (
            <span className="text-accent">Domain verified successfully</span>
          ) : (
            <span className="text-destructive">
              Verification failed — MX: {verifyMut.data.checks.mx ? "ok" : "missing"}, TXT:{" "}
              {verifyMut.data.checks.txt ? "ok" : "missing"}
            </span>
          )}
        </div>
      )}
      {showDns &&
        (dnsQuery.isLoading ? (
          <p className="mt-3 text-xs text-muted-foreground">Loading DNS records...</p>
        ) : dnsQuery.data?.dnsRecords ? (
          <DnsRecordsPanel records={dnsQuery.data.dnsRecords} />
        ) : (
          <p className="mt-3 text-xs text-destructive">
            {dnsQuery.error instanceof Error
              ? dnsQuery.error.message
              : "Could not load DNS records"}
          </p>
        ))}
    </div>
  );
}

export function DomainsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["domains"], queryFn: () => domainsApi.list() });
  const domains = data?.domains ?? [];
  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold">Domains</h1>
        <AddDomainDialog onAdded={() => {}} />
      </div>
      {isLoading && <p className="text-muted-foreground">Loading...</p>}
      {!isLoading && domains.length === 0 && (
        <div className="rounded-xl border border-border bg-card-grad p-10 text-center text-muted-foreground">
          No domains yet. Use the shared shieldme.cc domain or add your own custom domain.
        </div>
      )}
      <div className="space-y-4">
        {domains.map((d) => (
          <DomainCard key={d.id} domain={d} />
        ))}
      </div>
    </div>
  );
}
