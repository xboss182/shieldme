import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clearSession, getAccessToken, getRefreshToken, setSession, type Session } from "./auth";

export const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "https://api.shieldmail.vip";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

async function readError(res: Response): Promise<{ error: string; code?: string }> {
  try {
    const body = (await res.json()) as { error?: unknown; code?: unknown };
    return {
      error: typeof body.error === "string" ? body.error : res.statusText,
      code: typeof body.code === "string" ? body.code : undefined,
    };
  } catch {
    return { error: res.statusText };
  }
}

async function raw<T>(
  path: string,
  { method = "GET", body }: { method?: string; body?: unknown } = {},
  token?: string,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const info = await readError(res);
    throw new ApiError(res.status, info.error, info.code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Attaches the user's access token; on a 401 it tries one refresh-token
// rotation before failing. Clears the session if the refresh also 401s.
async function authFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const attempt = (token?: string) => raw<T>(path, opts, token);
  try {
    return await attempt(getAccessToken() ?? undefined);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401 || !getRefreshToken()) throw err;
    try {
      const session = await raw<Session>("/api/auth/refresh", {
        method: "POST",
        body: { refreshToken: getRefreshToken() },
      });
      setSession(session);
      return await attempt(session.accessToken);
    } catch {
      clearSession();
      throw err;
    }
  }
}

export const api = {
  get: <T>(path: string) => authFetch<T>(path),
  post: <T>(path: string, body?: unknown) => authFetch<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body: unknown) => authFetch<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body: unknown) => authFetch<T>(path, { method: "PUT", body }),
  del: <T>(path: string) => authFetch<T>(path, { method: "DELETE" }),
};

// Admin calls use the admin secret (raw Bearer token) rather than a user JWT.
export const adminApi = {
  get: <T>(path: string, token: string) => raw<T>("/api/admin" + path, {}, token),
  post: <T>(path: string, token: string, body?: unknown) =>
    raw<T>("/api/admin" + path, { method: "POST", body }, token),
  patch: <T>(path: string, token: string, body: unknown) =>
    raw<T>("/api/admin" + path, { method: "PATCH", body }, token),
  del: <T>(path: string, token: string, body?: unknown) =>
    raw<T>(
      "/api/admin" + path,
      { method: "DELETE", ...(body !== undefined ? { body } : {}) },
      token,
    ),
};

// ---- Shared format utils ----

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const DELIVERY_ERROR_LABELS: Record<string, string> = {
  mailbox_full: "Mailbox full",
  pgp_key_required: "PGP key required",
  spam_report: "Spam complaint",
  loop_sender: "Loop prevented",
  unknown_user: "Unknown recipient",
  size_limit: "Message too large",
  spam_policy: "Blocked by policy",
  relay_timeout: "Relay timeout",
  none: "Delivered",
};

// ---- Types (mirror alias-forwarder response shapes) ----

export type PgpMode = "none" | "optional" | "required";

export type Alias = {
  id: string;
  localPart: string;
  domainId: string;
  recipientId: string;
  status: "active" | "disabled";
  outboundMode: string;
  smtpRelayId: string | null;
  pgpMode: PgpMode;
  createdAt: string;
  updatedAt: string;
  domain: { domain: string };
  recipient: { email: string; pgpKey: PgpKey | null };
  protectionStatus: "protected" | "unprotected" | "required_missing_key";
};

export type AliasStats = {
  totalForwarded: number;
  totalBlocked: number;
  totalFailed: number;
  totalSpamTagged: number;
  totalSpamRejected: number;
  totalSpamQuarantined: number;
  totalSpamDetected: number;
  perAlias: Record<
    string,
    {
      forwarded: number;
      blocked: number;
      failed: number;
      spamTagged: number;
      spamRejected: number;
      spamQuarantined: number;
    }
  >;
};

export type Domain = {
  id: string;
  ownerId: string;
  domain: string;
  status: "verified" | "pending" | "failed";
  verifiedAt: string | null;
  dkimSelector: string | null;
  isActive: boolean;
  createdAt: string;
  isShared: boolean;
};

export type DnsRecord = {
  type: string;
  name: string;
  value: string;
  priority?: number;
  note?: string;
};
export type DnsRecords = { required: DnsRecord[]; optional: DnsRecord[] };

export type Recipient = {
  id: string;
  email: string;
  status: "verified" | "pending";
  verifiedAt: string | null;
  isActive: boolean;
  createdAt: string;
};

export type PgpKey = {
  fingerprint: string;
  algorithm: string;
  expiresAt: string | null;
  createdAt: string;
  expiresSoon?: boolean;
};

export type FailedDelivery = {
  id: string;
  aliasId: string;
  aliasLocalPart: string;
  aliasDomain: string;
  envelopeFrom: string;
  envelopeTo: string;
  forwardedTo: string;
  status: "failed" | "bounced" | "complained" | "rejected";
  failureType: string;
  failureReason: string;
  rejectionReason: string;
  outboundProvider: string;
  createdAt: string;
  updatedAt: string;
};

export type AccountPlan = "free" | "basic" | "pro" | "business";
export type PlanLimits = {
  maxDomains: number;
  maxAliases: number;
  maxRecipients: number;
  monthlyForwards: number;
  pgpEnabled: boolean;
  customOutboundProvider: boolean;
  billingEnabled: boolean;
};
export type PlanSummary = {
  plan: AccountPlan;
  limits: PlanLimits;
  usage: { domains: number; recipients: number; aliases: number; monthlyForwards: number };
};

// ---- Admin types ----

export type AdminUser = {
  id: string;
  email: string;
  role: string;
  plan: AccountPlan;
  isActive: boolean;
  createdAt: string;
  domainCount: number;
  recipientCount: number;
  aliasCount: number;
};
export type AdminDomain = {
  id: string;
  domain: string;
  ownerId: string;
  ownerEmail?: string;
  status: string;
  isActive: boolean;
  createdAt: string;
};
export type AdminAlias = {
  id: string;
  localPart: string;
  domain: string;
  recipientEmail: string;
  status: "active" | "disabled";
  pgpMode: PgpMode;
  createdAt: string;
};
export type AdminReserved = {
  id: string;
  localPart: string;
  domainId: string | null;
  domain: string | null;
  action: "reserve" | "allow";
  note: string;
  sourceBatch: string | null;
  createdAt: string;
};
export type AdminDelivery = {
  id: string;
  alias: string;
  recipient: string;
  status: string;
  failureType: string;
  pgpMode: PgpMode;
  createdAt: string;
};
export type AuditLog = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  actor: string;
  createdAt: string;
};

// ---- Query hooks ----

function invalidate(qc: ReturnType<typeof useQueryClient>, keys: string[][]) {
  for (const key of keys) void qc.invalidateQueries({ queryKey: key });
}

export function useAliases() {
  return useQuery({
    queryKey: ["aliases"],
    queryFn: () => api.get<{ aliases: Alias[] }>("/api/aliases").then((r) => r.aliases),
  });
}

export function useAliasStats() {
  return useQuery({
    queryKey: ["alias-stats"],
    queryFn: () => api.get<AliasStats>("/api/aliases/stats"),
  });
}

export function useDomains() {
  return useQuery({
    queryKey: ["domains"],
    queryFn: () => api.get<{ domains: Domain[] }>("/api/domains").then((r) => r.domains),
  });
}

export function useDomain(id: string) {
  return useQuery({
    queryKey: ["domain", id],
    enabled: Boolean(id),
    queryFn: () => api.get<{ domain: Domain; dnsRecords: DnsRecords }>(`/api/domains/${id}`),
  });
}

export function useRecipients() {
  return useQuery({
    queryKey: ["recipients"],
    queryFn: () =>
      api.get<{ recipients: Recipient[] }>("/api/recipients").then((r) => r.recipients),
  });
}

export function useRecipientPgp(id: string) {
  return useQuery({
    queryKey: ["recipient-pgp", id],
    enabled: Boolean(id),
    queryFn: async () => {
      try {
        const r = await api.get<{ pgpKey: PgpKey }>(`/api/recipients/${id}/pgp-key?full=true`);
        return r.pgpKey;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });
}

export function usePlan() {
  return useQuery({
    queryKey: ["plan"],
    queryFn: () => api.get<PlanSummary>("/api/plans/me"),
  });
}

export function usePlanTiers() {
  return useQuery({
    queryKey: ["plan-tiers"],
    queryFn: () =>
      api.get<{ plans: Record<AccountPlan, PlanLimits> }>("/api/plans/tiers").then((r) => r.plans),
  });
}

export function useFailedDeliveries(status: string) {
  return useQuery({
    queryKey: ["failed-deliveries", status],
    queryFn: () => {
      const q = status && status !== "all" ? `?status=${status}` : "";
      return api
        .get<{ deliveries: FailedDelivery[] }>(`/api/aliases/failed-deliveries?limit=100${q}`)
        .then((r) => r.deliveries.filter((d) => status === "all" || d.status === status));
    },
  });
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api.get<{ user: { userId: string; email: string } }>("/api/auth/me").then((r) => r.user),
  });
}

// ---- Auth mutations ----

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const session = await raw<Session>("/api/auth/login", { method: "POST", body: input });
      setSession(session);
      return session.user;
    },
    onSuccess: () => void qc.invalidateQueries(),
  });
}

// ---- Alias mutations ----

export function useCreateAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      localPart?: string;
      serviceLabel?: string;
      domainId: string;
      recipientId: string;
      pgpMode?: PgpMode;
    }) => api.post<{ alias: Alias }>("/api/aliases", body),
    onSettled: () => invalidate(qc, [["aliases"], ["alias-stats"]]),
  });
}

export function useSetAliasPgp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pgpMode }: { id: string; pgpMode: PgpMode }) =>
      api.patch<{ alias: Alias }>(`/api/aliases/${id}`, { pgpMode }),
    onSettled: () => invalidate(qc, [["aliases"]]),
  });
}

export function useToggleAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enable }: { id: string; enable: boolean }) =>
      enable ? api.post(`/api/aliases/${id}/enable`) : api.post(`/api/aliases/${id}/disable`),
    onSettled: () => invalidate(qc, [["aliases"]]),
  });
}

export function useDeleteAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/aliases/${id}`),
    onSettled: () => invalidate(qc, [["aliases"], ["alias-stats"]]),
  });
}

export function useVerificationCode() {
  return useMutation({
    mutationFn: (id: string) =>
      api.get<{ verificationCode: string }>(`/api/aliases/${id}/verification-code`),
  });
}

// ---- Domain mutations ----

export function useAddDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) => api.post("/api/domains", { domain }),
    onSettled: () => invalidate(qc, [["domains"]]),
  });
}

export function useVerifyDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/domains/${id}/verify`),
    onSettled: () => invalidate(qc, [["domains"], ["domain"]]),
  });
}

export function useDeleteDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/domains/${id}`),
    onSettled: () => invalidate(qc, [["domains"]]),
  });
}

// ---- Recipient mutations ----

export function useAddRecipient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) =>
      api.post<{ verificationToken: string }>("/api/recipients", { email }),
    onSettled: () => invalidate(qc, [["recipients"]]),
  });
}

export function useVerifyRecipient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, token }: { id: string; token: string }) =>
      api.post(`/api/recipients/${id}/verify`, { token }),
    onSettled: () => invalidate(qc, [["recipients"]]),
  });
}

export function useResendRecipient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/recipients/${id}/resend`),
    onSettled: () => invalidate(qc, [["recipients"]]),
  });
}

export function useDeleteRecipient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/recipients/${id}`),
    onSettled: () => invalidate(qc, [["recipients"]]),
  });
}

export function useUploadPgp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, publicKeyArmored }: { id: string; publicKeyArmored: string }) =>
      api.post(`/api/recipients/${id}/pgp-key`, { publicKeyArmored }),
    onSettled: () => invalidate(qc, [["recipient-pgp"]]),
  });
}

export function useRemovePgp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/recipients/${id}/pgp-key`),
    onSettled: () => invalidate(qc, [["recipient-pgp"]]),
  });
}

export function useTestPgp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/recipients/${id}/pgp-key/test`),
    onSettled: () => invalidate(qc, [["recipient-pgp"]]),
  });
}
