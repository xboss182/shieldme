import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { recipientsApi, pgpApi, ApiError, type PgpKeyInfo } from "../lib/api";
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
import { Textarea } from "../components/ui/textarea";
import {
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  RefreshCw,
  KeyRound,
  Shield,
  ShieldOff,
  Upload,
  Send,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/_app/recipients")({ component: RecipientsPage });

function AddRecipientDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [verifyToken, setVerifyToken] = useState<string | null>(null);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => recipientsApi.add(email),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["recipients"] });
      setEmail("");
      if (!data.verificationSent && data.verificationToken) {
        setVerifyToken(data.verificationToken);
      } else {
        setOpen(false);
      }
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Failed to add recipient"),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setVerifyToken(null);
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add recipient
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border bg-surface">
        <DialogHeader>
          <DialogTitle>Add recipient email</DialogTitle>
        </DialogHeader>
        {verifyToken ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Recipient added. The verification email could not be sent, so use this manual
              verification token:
            </p>
            <code className="block break-all rounded-lg border border-border bg-surface/40 p-3 text-xs">
              {verifyToken}
            </code>
            <p className="text-xs text-muted-foreground">
              Paste this token into the pending recipient's Verify dialog.
            </p>
            <Button
              className="w-full"
              onClick={() => {
                setOpen(false);
                setVerifyToken(null);
              }}
            >
              Done
            </Button>
          </div>
        ) : (
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
              type="email"
              placeholder="you@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              A verification email will be sent to this address.
            </p>
            <Button type="submit" className="w-full" disabled={mut.isPending}>
              {mut.isPending ? "Adding..." : "Add recipient"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function VerifyRecipientDialog({ recipientId }: { recipientId: string }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const qc = useQueryClient();
  const verifyMut = useMutation({
    mutationFn: () => recipientsApi.verify(recipientId, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipients"] });
      setOpen(false);
      setToken("");
      setError("");
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Failed to verify recipient"),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setToken("");
          setError("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <KeyRound className="h-3.5 w-3.5" />
          Verify
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border bg-surface">
        <DialogHeader>
          <DialogTitle>Verify recipient</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            verifyMut.mutate();
          }}
          className="space-y-4"
        >
          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Paste the verification code from the email sent to this recipient.
          </p>
          <Input
            placeholder="Verification code"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
          />
          <Button type="submit" className="w-full" disabled={verifyMut.isPending}>
            {verifyMut.isPending ? "Verifying..." : "Verify recipient"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Status badge for a PGP key: protected / expiring soon / unprotected */
function PgpStatusBadge({ pgpKey }: { pgpKey: PgpKeyInfo | null }) {
  if (!pgpKey) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
        <ShieldOff className="h-3 w-3" />
        Unprotected
      </span>
    );
  }
  if (pgpKey.isExpiringSoon) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning"
        title="Key expires within 30 days — upload a new key soon"
      >
        <AlertTriangle className="h-3 w-3" />
        Key expiring soon
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
      <Shield className="h-3 w-3" />
      Protected
    </span>
  );
}

function PgpKeySection({ recipientId }: { recipientId: string }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [keyText, setKeyText] = useState("");
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: keyData, isLoading } = useQuery({
    queryKey: ["pgp-key", recipientId],
    queryFn: () =>
      pgpApi.getKey(recipientId).catch((e) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }),
  });

  const key: PgpKeyInfo | null = keyData?.pgpKey ?? null;

  const uploadMut = useMutation({
    mutationFn: () => pgpApi.uploadKey(recipientId, keyText),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pgp-key", recipientId] });
      setUploadOpen(false);
      setKeyText("");
      setError("");
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Failed to upload PGP key"),
  });

  const deleteMut = useMutation({
    mutationFn: () => pgpApi.deleteKey(recipientId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pgp-key", recipientId] }),
  });

  const testMut = useMutation({
    mutationFn: () => pgpApi.testDelivery(recipientId),
    onSuccess: () => setTestResult("Test email sent — check your inbox and try to decrypt it."),
    onError: (e) =>
      setTestResult("Failed: " + (e instanceof ApiError ? e.message : "unknown error")),
  });

  if (isLoading) return null;

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface/40 px-3 py-2 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <PgpStatusBadge pgpKey={key} />
          {key && (
            <>
              <span className="text-xs text-muted-foreground font-mono">
                {key.fingerprint.slice(-8)}
              </span>
              {key.expiresAt && (
                <span
                  className={`text-xs ${key.isExpiringSoon ? "text-warning font-medium" : "text-muted-foreground"}`}
                >
                  · expires {new Date(key.expiresAt).toLocaleDateString()}
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {key && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 gap-1 px-2 text-xs"
              onClick={() => {
                setTestResult(null);
                testMut.mutate();
              }}
              disabled={testMut.isPending}
              title="Send a test encrypted email to this recipient"
            >
              <Send className="h-3 w-3" />
              {testMut.isPending ? "Sending..." : "Test delivery"}
            </Button>
          )}
          <Dialog
            open={uploadOpen}
            onOpenChange={(v) => {
              setUploadOpen(v);
              if (!v) {
                setKeyText("");
                setError("");
              }
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-xs">
                <Upload className="h-3 w-3" />
                {key ? "Replace" : "Upload"}
              </Button>
            </DialogTrigger>
            <DialogContent className="border-border bg-surface">
              <DialogHeader>
                <DialogTitle>{key ? "Replace PGP key" : "Upload PGP public key"}</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setError("");
                  uploadMut.mutate();
                }}
                className="space-y-3"
              >
                {error && (
                  <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Paste the armored ASCII PGP public key block below. The key must be a public key
                  (not private), parseable, and not expired.
                </p>
                <Textarea
                  placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----..."
                  value={keyText}
                  onChange={(e) => setKeyText(e.target.value)}
                  rows={8}
                  className="font-mono text-xs border-border bg-surface"
                  required
                />
                <Button type="submit" className="w-full" disabled={uploadMut.isPending}>
                  {uploadMut.isPending ? "Uploading..." : "Upload key"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          {key && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                  Remove
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="border-border bg-surface">
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove PGP key?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the PGP key for this recipient. Aliases set to{" "}
                    <strong>PGP required</strong> will start rejecting incoming mail — update those
                    aliases or upload a new key to restore delivery.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMut.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
      {testResult && (
        <p
          className={`text-xs rounded px-2 py-1 ${testResult.startsWith("Failed") ? "bg-destructive/10 text-destructive" : "bg-accent/10 text-accent"}`}
        >
          {testResult}
        </p>
      )}
      {key?.isExpiringSoon && (
        <p className="text-xs rounded px-2 py-1 bg-warning/10 text-warning">
          <AlertTriangle className="inline h-3 w-3 mr-1" />
          This key expires on {new Date(key.expiresAt!).toLocaleDateString()}. Upload a replacement
          key to avoid delivery failures on aliases using PGP required mode.
        </p>
      )}
    </div>
  );
}

export function RecipientsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["recipients"],
    queryFn: () => recipientsApi.list(),
  });
  const recipients = data?.recipients ?? [];
  const resendMut = useMutation({
    mutationFn: (id: string) => recipientsApi.resendVerification(id),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => recipientsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recipients"] }),
  });
  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold">Recipients</h1>
        <AddRecipientDialog />
      </div>
      {isLoading && <p className="text-muted-foreground">Loading...</p>}
      {!isLoading && recipients.length === 0 && (
        <div className="rounded-xl border border-border bg-card-grad p-10 text-center text-muted-foreground">
          No recipients yet. Add one to start forwarding aliases.
        </div>
      )}
      {recipients.length > 0 && (
        <div className="space-y-2">
          {recipients.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-border bg-card-grad px-5 py-4 shadow-card"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{r.email}</span>
                  {r.status === "verified" ? (
                    <Badge className="bg-accent/20 text-accent border-accent/30 gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Verified
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <Clock className="h-3 w-3" />
                      Pending
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  {r.status === "pending" && (
                    <>
                      <VerifyRecipientDialog recipientId={r.id} />
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => resendMut.mutate(r.id)}
                        disabled={resendMut.isPending}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Resend
                      </Button>
                    </>
                  )}
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
                        <AlertDialogTitle>Delete recipient?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will delete {r.email} and may disable aliases forwarding to it.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMut.mutate(r.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              {r.status === "verified" && <PgpKeySection recipientId={r.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
