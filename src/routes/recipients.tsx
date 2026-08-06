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
import { formatDate, recipients as seedRecipients, type Recipient } from "@/lib/mock-data";

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
  const [list, setList] = useState<Recipient[]>(seedRecipients);
  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [manualToken, setManualToken] = useState<string | null>(null);
  const [verifyFor, setVerifyFor] = useState<Recipient | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [keyFor, setKeyFor] = useState<Recipient | null>(null);
  const [keyText, setKeyText] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Recipient | null>(null);
  const [removeKeyFor, setRemoveKeyFor] = useState<Recipient | null>(null);
  const [tests, setTests] = useState<Record<string, string>>({});

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

        {list.length === 0 ? (
          <Panel>
            <EmptyState
              title="No recipients yet"
              description="Add one to start forwarding aliases to a real inbox."
            />
          </Panel>
        ) : (
          <div className="space-y-3">
            {list.map((r) => {
              const key = r.pgpKey;
              return (
                <div key={r.id} className="bg-neutral-50 ring-1 ring-black/5 rounded-xl">
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
                          <Btn onClick={() => setVerifyFor(r)}>Verify</Btn>
                          <Btn
                            onClick={() =>
                              setTests((t) => ({ ...t, [r.id]: "Verification email resent." }))
                            }
                          >
                            Resend
                          </Btn>
                        </>
                      ) : null}
                      <Btn variant="danger" onClick={() => setPendingDelete(r)}>
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
                        tone={!key ? "neutral" : key.isExpiringSoon ? "amber" : "emerald"}
                      >
                        {!key
                          ? "Unprotected"
                          : key.isExpiringSoon
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
                              setTests((t) => ({
                                ...t,
                                [r.id]: "Test message encrypted and delivered successfully.",
                              }))
                            }
                          >
                            Test delivery
                          </Btn>
                        ) : null}
                        <Btn
                          onClick={() => {
                            setKeyFor(r);
                            setKeyText("");
                          }}
                        >
                          {key ? "Replace" : "Upload"}
                        </Btn>
                        {key ? (
                          <Btn variant="danger" onClick={() => setRemoveKeyFor(r)}>
                            Remove
                          </Btn>
                        ) : null}
                      </div>
                    </div>

                    {key?.isExpiringSoon ? (
                      <p className="mt-3 text-xs text-amber-700 bg-amber-50 ring-1 ring-amber-500/15 rounded-md px-3 py-2">
                        This key expires soon. Rotate it before {formatDate(key.expiresAt!)} or
                        PGP-required aliases will start rejecting mail.
                      </p>
                    ) : null}

                    {tests[r.id] ? (
                      <p className="mt-3 text-xs font-mono text-emerald-600">{tests[r.id]}</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
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
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setAddOpen(false)}>Cancel</Btn>
              <Btn
                variant="primary"
                disabled={!newEmail.trim()}
                onClick={() => {
                  setList((prev) => [
                    ...prev,
                    {
                      id: `rcp_${Math.random().toString(36).slice(2, 7)}`,
                      email: newEmail.trim(),
                      status: "pending",
                      isActive: false,
                      verifiedAt: null,
                      createdAt: new Date().toISOString(),
                      pgpKey: null,
                    },
                  ]);
                  setNewEmail("");
                  setManualToken(`SM-VERIFY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`);
                }}
              >
                Add recipient
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={verifyFor !== null}
        onClose={() => setVerifyFor(null)}
        title="Verify recipient"
        description={`Paste the code we emailed to ${verifyFor?.email}.`}
      >
        <div className="space-y-4">
          <Field label="Verification code">
            <TextInput
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              placeholder="SM-VERIFY-XXXXXX"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setVerifyFor(null)}>Cancel</Btn>
            <Btn
              variant="primary"
              disabled={!verifyCode.trim()}
              onClick={() => {
                setList((prev) =>
                  prev.map((x) =>
                    x.id === verifyFor?.id
                      ? { ...x, status: "verified", isActive: true, verifiedAt: new Date().toISOString() }
                      : x,
                  ),
                );
                setVerifyCode("");
                setVerifyFor(null);
              }}
            >
              Verify
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal
        open={keyFor !== null}
        onClose={() => setKeyFor(null)}
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
            <Btn onClick={() => setKeyFor(null)}>Cancel</Btn>
            <Btn
              variant="primary"
              disabled={!keyText.trim()}
              onClick={() => {
                setList((prev) =>
                  prev.map((x) =>
                    x.id === keyFor?.id
                      ? {
                          ...x,
                          pgpKey: {
                            fingerprint: Math.random()
                              .toString(16)
                              .slice(2, 18)
                              .toUpperCase()
                              .padEnd(16, "0"),
                            algorithm: "RSA 4096",
                            expiresAt: undefined,
                            isExpiringSoon: false,
                            createdAt: new Date().toISOString(),
                          },
                        }
                      : x,
                  ),
                );
                setKeyFor(null);
              }}
            >
              Save key
            </Btn>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={removeKeyFor !== null}
        onClose={() => setRemoveKeyFor(null)}
        onConfirm={() =>
          setList((prev) =>
            prev.map((x) => (x.id === removeKeyFor?.id ? { ...x, pgpKey: null } : x)),
          )
        }
        title="Remove PGP key?"
        description="Aliases set to PGP required will immediately start rejecting mail for this recipient."
        confirmLabel="Remove key"
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => setList((prev) => prev.filter((x) => x.id !== pendingDelete?.id))}
        title="Delete this recipient?"
        description={`Aliases forwarding to ${pendingDelete?.email} will stop delivering mail.`}
      />
    </AppShell>
  );
}
