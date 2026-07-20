import type { SmtpRelayStatus } from "./api";

export const smtpRelayStatuses = [
  "draft",
  "credentials_unverified",
  "testing_dns",
  "testing_tls",
  "testing_auth",
  "test_submitted",
  "awaiting_recipient_confirmation",
  "ready",
  "active",
  "degraded",
  "circuit_open",
  "disabled",
  "revoked",
] as const satisfies readonly SmtpRelayStatus[];

export type SmtpRelayUiStatus = SmtpRelayStatus;

export const smtpRelayStatusLabel: Record<SmtpRelayUiStatus, string> = {
  draft: "draft",
  credentials_unverified: "credentials untested",
  testing_dns: "testing",
  testing_tls: "testing",
  testing_auth: "testing",
  test_submitted: "testing",
  awaiting_recipient_confirmation: "testing",
  ready: "ready",
  active: "active",
  degraded: "degraded",
  circuit_open: "circuit open",
  disabled: "disabled",
  revoked: "revoked",
};

export type RelayPageState = "loading" | "disabled" | "error" | "empty" | "ready";

export function relayPageState(input: {
  loading: boolean;
  enabled: boolean;
  error: boolean;
  relayCount: number;
}): RelayPageState {
  if (input.loading) return "loading";
  if (!input.enabled) return "disabled";
  if (input.error) return "error";
  return input.relayCount === 0 ? "empty" : "ready";
}

export function relayCheckRows(
  status: SmtpRelayUiStatus,
  outcomeCode: string | null,
): Array<{
  label: string;
  state: "passed" | "failed" | "running" | "pending";
  code: string | null;
}> {
  const phase =
    status === "testing_dns"
      ? 0
      : status === "testing_tls"
        ? 1
        : status === "testing_auth"
          ? 2
          : ["test_submitted", "awaiting_recipient_confirmation", "ready", "active"].includes(
                status,
              )
            ? 3
            : -1;
  const failed = ["degraded", "circuit_open"].includes(status);
  return ["DNS", "TLS", "SMTP authentication", "test message"].map((label, index) => ({
    label,
    state: failed ? "failed" : index < phase ? "passed" : index === phase ? "running" : "pending",
    code: failed || index === phase ? outcomeCode : null,
  }));
}

export function canAssignCustomRelay(status: SmtpRelayUiStatus, circuitStatus: string): boolean {
  return ["ready", "active"].includes(status) && circuitStatus === "closed";
}
