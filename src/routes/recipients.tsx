import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  Btn,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Panel,
  StatusPill,
  TextArea,
  TextInput,
} from "@/components/ui-kit";
import {
  useAddRecipient,
  useDeleteRecipient,
  useRecipientPgp,
  useRecipients,
  useRemovePgp,
  useResendRecipient,
  useTestPgp,
  useUploadPgp,
  useVerifyRecipient,
  formatDate,
  type Recipient,
} from "@/lib/api";

export const Route = createFileRoute("/recipients")({
  head: () => ({
    meta: [
      { title: "Recipients — ShieldMail" },
      {
        name: "description",
        content: "Verify forwarding inboxes and manage the PGP keys that encrypt their mail.",
      },
      { property: "og:title", content: "Recipients — ShieldMail" },
      {
        property: "og:description",
        content: "Verify forwarding inboxes and manage the PGP keys that encrypt their mail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecipientsPage,
});

function RecipientsPage() {
  const { data: list, isLoading, isError, error } = useRecipients();
  const addRecipient = useAddRecipient();
  const deleteRecipient = useDeleteRecipient();

  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [manualToken, setManualToken] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Recipient | null>(null);

  const recipients = list ?? [];

  return (
    <AppShell
      eyebrow="Recipients"
      action={
        <Btn variant="primary" onClick={() => setAddOpen(true)} className="text-sm py-2 px-3">
          <Plus className="size-3.5" /> Add recipient
        </Btn>
      }
    >
      <div className="p-8 max-w-7xl w-full mx-auto">
        <PageHeader
          title="Recipients"
          description="The real inboxes behind your aliases. Upload a PGP public key to encrypt everything ShieldMail forwards to them."
        />

        {isLoading ? (
          <Panel>
            <p className="py-10 text-center text-sm text-neutral-400">Loading recipients…</p>
          </Panel>
        ) : isError ? (
          <Panel>
            <p className="py-10 text-center text-sm text-rose-600">
              Couldn't load recipients: {error instanceof Error ? error.message : "unknown error"}
            </p>
          </Panel>
        ) : recipients.length === 0 ? (
          <Panel>
            <EmptyState
              title="No recipients yet"
              description="Add one to start forwarding aliases to a real inbox."
            />
          </Panel>
        ) : (
          <div className="space-y-3">
            {recipients.map((r) => (
              <RecipientRow key={r.id} recipient={r} onDelete={() => setPendingDelete(r)} />
            ))}
          </div>
        )}
      </div>

      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setManualToken(null);
        }}
        title="Add recipient"
        description="We'll send a confirmation code to this inbox."
      >
        {manualToken ? (
          <div className="space-y-4">
            <p className="text-xs text-neutral-500">
              We couldn't send the email automatically. Use this verification token manually:
            </p>
            <p className="font-mono text-sm bg-white ring-1 ring-black/5 rounded-md px-3 py-2">
              {manualToken}
            </p>
            <div className="flex justify-end">
              <Btn
                variant="primary"
                onClick={() => {
                  setManualToken(null);
                  setAddOpen(false);
                }}
              >
                Done
              </Btn>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Email address">
              <TextInput
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            {addRecipient.isError ? (
              <p className="text-xs text-rose-600">
                {addRecipient.error instanceof Error ? addRecipient.error.message : "Add failed"}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setAddOpen(false)}>Cancel</Btn>
              <Btn
                variant="primary"
                disabled={!newEmail.trim() || addRecipient.isPending}
                onClick={() =>
                  addRecipient.mutate(newEmail.trim(), {
                    onSuccess: (r) => {
                      setNewEmail("");
                      if (r?.verificationToken) setManualToken(r.verificationToken);
                      else setAddOpen(false);
                    },
                  })
                }
              >
                {addRecipient.isPending ? "Adding…" : "Add recipient"}
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteRecipient.mutate(pendingDelete.id);
        }}
        title="Delete this recipient?"
        description={`Aliases forwarding to ${pendingDelete?.email} will stop delivering mail.`}
      />
    </AppShell>
  );
}

function RecipientRow({ recipient: r, onDelete }: { recipient: Recipient; onDelete: () => void }) {
  const { data: key, isLoading: keyLoading } = useRecipientPgp(r.id);
  const verifyRecipient = useVerifyRecipient();
  const resendRecipient = useResendRecipient();
  const uploadPgp = useUploadPgp();
  const removePgp = useRemovePgp();
  const testPgp = useTestPgp();

  const [verifyFor, setVerifyFor] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [keyFor, setKeyFor] = useState(false);
  const [keyText, setKeyText] = useState("");
  const [removeKeyFor, setRemoveKeyFor] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const isExpiring =
    key?.expiresSoon ??
    (key?.expiresAt
      ? new Date(key.expiresAt).getTime() - Date.now() <= 30 * 24 * 60 * 60 * 1000
      : false);

  return (
    <div className="bg-neutral-50 ring-1 ring-black/5 rounded-xl">
      <div className="p-5 flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium">{r.email}</span>
            <StatusPill tone={r.status === "verified" ? "emerald" : "amber"}>
              {r.status === "verified" ? "Verified" : "Pending"}
            </StatusPill>
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            {r.verifiedAt
              ? `Verified ${formatDate(r.verifiedAt)}`
              : `Added ${formatDate(r.createdAt)} · awaiting confirmation`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {r.status === "pending" ? (
            <>
              <Btn onClick={() => setVerifyFor(true)}>Verify</Btn>
              <Btn
                onClick={() =>
                  resendRecipient.mutate(r.id, {
                    onSuccess: () => setNotice("Verification email resent."),
                    onError: (e) => setNotice(e instanceof Error ? e.message : "Resend failed"),
                  })
                }
              >
                Resend
              </Btn>
            </>
          ) : null}
          <Btn variant="danger" onClick={onDelete}>
            <Trash2 className="size-3.5" />
          </Btn>
        </div>
      </div>

      <div className="border-t border-neutral-200/60 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-neutral-400">
            <KeyRound className="size-3" /> PGP key
          </span>
          <StatusPill
            tone={keyLoading ? "neutral" : !key ? "neutral" : isExpiring ? "amber" : "emerald"}
          >
            {keyLoading
              ? "…"
              : !key
                ? "Unprotected"
                : isExpiring
                  ? "Key expiring soon"
                  : "Protected"}
          </StatusPill>
          {key ? (
            <span className="font-mono text-[11px] text-neutral-500">
              …{key.fingerprint.slice(-8)} · {key.algorithm}
              {key.expiresAt ? ` · expires ${formatDate(key.expiresAt)}` : ""}
            </span>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            {key ? (
              <Btn
                onClick={() =>
                  testPgp.mutate(r.id, {
                    onSuccess: () =>
                      setNotice("Test message encrypted and delivered successfully."),
                    onError: (e) => setNotice(e instanceof Error ? e.message : "Test failed"),
                  })
                }
              >
                Test delivery
              </Btn>
            ) : null}
            <Btn
              onClick={() => {
                setKeyFor(true);
                setKeyText("");
              }}
            >
              {key ? "Replace" : "Upload"}
            </Btn>
            {key ? (
              <Btn variant="danger" onClick={() => setRemoveKeyFor(true)}>
                Remove
              </Btn>
            ) : null}
          </div>
        </div>

        {key && isExpiring ? (
          <p className="mt-3 text-xs text-amber-700 bg-amber-50 ring-1 ring-amber-500/15 rounded-md px-3 py-2">
            This key expires soon. Rotate it before {formatDate(key.expiresAt!)} or PGP-required
            aliases will start rejecting mail.
          </p>
        ) : null}

        {notice ? <p className="mt-3 text-xs font-mono text-emerald-600">{notice}</p> : null}

        {uploadPgp.isError ? (
          <p className="mt-3 text-xs text-rose-600">
            {uploadPgp.error instanceof Error ? uploadPgp.error.message : "Upload failed"}
          </p>
        ) : null}
      </div>

      <Modal
        open={verifyFor}
        onClose={() => setVerifyFor(false)}
        title="Verify recipient"
        description={`Paste the code we emailed to ${r.email}.`}
      >
        <div className="space-y-4">
          <Field label="Verification code">
            <TextInput
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              placeholder="Verification token"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setVerifyFor(false)}>Cancel</Btn>
            <Btn
              variant="primary"
              disabled={!verifyCode.trim() || verifyRecipient.isPending}
              onClick={() =>
                verifyRecipient.mutate(
                  { id: r.id, token: verifyCode.trim() },
                  {
                    onSuccess: () => {
                      setVerifyCode("");
                      setVerifyFor(false);
                    },
                    onError: (e) =>
                      setNotice(e instanceof Error ? e.message : "Verification failed"),
                  },
                )
              }
            >
              {verifyRecipient.isPending ? "Verifying…" : "Verify"}
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal
        open={keyFor}
        onClose={() => setKeyFor(false)}
        title="Upload PGP public key"
        description="Paste the armored public key block for this recipient."
      >
        <div className="space-y-4">
          <TextArea
            rows={8}
            value={keyText}
            onChange={(e) => setKeyText(e.target.value)}
            placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
          />
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setKeyFor(false)}>Cancel</Btn>
            <Btn
              variant="primary"
              disabled={!keyText.trim() || uploadPgp.isPending}
              onClick={() =>
                uploadPgp.mutate(
                  { id: r.id, publicKeyArmored: keyText },
                  {
                    onSuccess: () => {
                      setKeyText("");
                      setKeyFor(false);
                    },
                  },
                )
              }
            >
              {uploadPgp.isPending ? "Saving…" : "Save key"}
            </Btn>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={removeKeyFor}
        onClose={() => setRemoveKeyFor(false)}
        onConfirm={() => removePgp.mutate(r.id)}
        title="Remove PGP key?"
        description="Aliases set to PGP required will immediately start rejecting mail for this recipient."
        confirmLabel="Remove key"
      />
    </div>
  );
}
