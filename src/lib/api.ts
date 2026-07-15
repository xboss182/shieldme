// API client for api.shieldme.cc
type ShieldMeImportMeta = ImportMeta & {
  env?: {
    VITE_API_BASE_URL?: string;
  };
};

const API_BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta as ShieldMeImportMeta).env?.VITE_API_BASE_URL) ||
  "https://api.shieldme.cc";

export const tokenStore = {
  getAccess: () => (typeof window !== "undefined" ? localStorage.getItem("sm_access") : null),
  getRefresh: () => (typeof window !== "undefined" ? localStorage.getItem("sm_refresh") : null),
  set: (access: string, refresh: string) => {
    localStorage.setItem("sm_access", access);
    localStorage.setItem("sm_refresh", refresh);
  },
  clear: () => {
    localStorage.removeItem("sm_access");
    localStorage.removeItem("sm_refresh");
  },
};

export interface AuthUser {
  id: string;
  email: string;
  role?: string;
  plan?: AccountPlan;
}
export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}
export interface DnsRecords {
  mx?: { type: string; name: string; value: string; priority?: number };
  txt?: { type: string; name: string; value: string };
  spf?: { type: string; name: string; value: string };
  dkim?: { type: string; name: string; value: string };
  dmarc?: { type: string; name: string; value: string };
}
export interface Domain {
  id: string;
  domain: string;
  status: "pending" | "verified" | "failed";
  verificationStatus?: "pending" | "verified" | "failed"; // alias for compat
  isActive: boolean;
  isShared?: boolean;
  dkimSelector: string;
  verifiedAt?: string | null;
  createdAt: string;
  dnsRecords?: DnsRecords;
}
export interface Recipient {
  id: string;
  email: string;
  status: "pending" | "verified";
  verified?: boolean; // alias for compat
  isActive: boolean;
  verifiedAt?: string | null;
  createdAt: string;
}
export type AliasProtectionStatus = "protected" | "unprotected" | "required_missing_key";
export interface AliasProtection {
  status: AliasProtectionStatus;
  pgpMode: "none" | "optional" | "required";
  encryptedForwarding: boolean;
  plaintextForwardingPossible: boolean;
  key: {
    available: boolean;
    fingerprint?: string;
    algorithm?: string;
    expiresAt?: string | null;
    expiresSoon?: boolean;
    rotationGuidance?: string;
  };
}
export interface Alias {
  id: string;
  localPart: string;
  domainId: string;
  domain?: { domain: string };
  recipientId: string;
  recipient?: { email: string };
  status: "active" | "disabled";
  pgpMode?: "none" | "optional" | "required";
  protectionStatus?: AliasProtectionStatus;
  protection?: AliasProtection;
  enabled?: boolean; // alias for compat
  createdAt: string;
  updatedAt: string;
}
export interface AliasStats {
  totalForwarded: number;
  totalBlocked: number;
  totalFailed: number;
  totalSpamTagged?: number;
  totalSpamRejected?: number;
  totalSpamQuarantined?: number;
  totalSpamDetected?: number;
  perAlias: Record<
    string,
    {
      forwarded: number;
      blocked: number;
      failed: number;
      spamTagged?: number;
      spamRejected?: number;
      spamQuarantined?: number;
    }
  >;
}
export type AccountPlan = "free" | "basic" | "pro" | "business";
export interface PlanLimits {
  maxDomains: number;
  maxAliases: number;
  maxRecipients: number;
  monthlyForwards: number;
  pgpEnabled: boolean;
  customOutboundProvider: boolean;
  billingEnabled: boolean;
}
export interface PlanSummary {
  plan: AccountPlan;
  limits: PlanLimits;
  usage: { domains: number; recipients: number; aliases: number; monthlyForwards: number };
}

export interface SmtpRelay {
  id: string;
  enabled: boolean;
  name: string;
  domain: string;
  host: string;
  port: number;
  provider: string;
  tls: "required" | "opportunistic";
  pgp: "required" | "optional";
  credentialConfigured?: boolean;
  lastTestedAt?: string;
  lastTestStatus?: "passed" | "failed";
  createdAt: string;
  updatedAt: string;
  stats: { sent: number; delivered: number; bounced: number; blocked: number };
}
export type SmtpRelayInput = Pick<
  SmtpRelay,
  "name" | "domain" | "host" | "port" | "provider" | "tls" | "pgp" | "enabled"
> & { credentials?: { username: string; password: string } };

export interface AdminConfig {
  platformDomain?: string;
  resendConfigured?: boolean;
  sesConfigured?: boolean;
  outboundProvider?: "resend" | "ses";
  outboundConfigured?: boolean;
  forwardingEnabled?: boolean;
}

export interface AdminStats {
  totals: Record<string, number>;
  active: Record<string, number>;
  suspended: Record<string, number>;
  deliveries: Array<{ status: string; window: string; count: number }> & {
    pgpEncrypted?: number;
  };
  pgpEncryptedDeliveries: number;
  queueDepth: Record<string, number> | number;
  users?: { total: number };
  domains?: { total: number };
  aliases?: { total: number };
  queue?: { depth: number };
}
export interface AdminUser {
  id: string;
  email: string;
  role: string;
  plan?: AccountPlan;
  isActive: boolean;
  domainCount?: number;
  recipientCount?: number;
  aliasCount?: number;
  createdAt: string;
  updatedAt: string;
}
export interface AdminDomain {
  id: string;
  domain: string;
  status: string;
  isActive: boolean;
  ownerEmail?: string;
  createdAt: string;
  updatedAt: string;
}
export interface AdminAlias {
  id: string;
  localPart: string;
  domain?: string;
  recipientEmail?: string;
  ownerEmail?: string;
  status: string;
  pgpMode?: string;
  createdAt: string;
  updatedAt: string;
}
export interface AuditLog {
  id: string;
  timestamp: string;
  actorType: string;
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
}
export type AdminAuditLog = AuditLog;
export interface AdminDelivery {
  id: string;
  envelopeFrom: string;
  envelopeTo: string;
  forwardedTo?: string | null;
  status: string;
  errorMessage?: string | null;
  pgpModeUsed?: string | null;
  sizeBytes?: number | null;
  createdAt: string;
  updatedAt: string;
  alias?: string;
  recipient?: string;
  pgpMode?: string | null;
}

export interface FailedDelivery {
  id: string;
  aliasId?: string | null;
  aliasLocalPart?: string | null;
  aliasDomain?: string | null;
  envelopeFrom: string;
  envelopeTo: string;
  forwardedTo?: string | null;
  status: string;
  failureType?: string | null;
  failureReason?: string | null;
  rejectionReason?: string | null;
  outboundProvider?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReservedLocalPart {
  id: string;
  localPart: string;
  domainId?: string | null;
  domain?: string | null;
  action: "reserve" | "allow";
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function tryRefresh(): Promise<boolean> {
  const refresh = tokenStore.getRefresh();
  if (!refresh) return false;
  try {
    const res = await fetch(API_BASE + "/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) return false;
    const data: AuthResponse = await res.json();
    tokenStore.set(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean; adminSecret?: string } = {},
): Promise<T> {
  const { skipAuth, adminSecret, ...fetchOpts } = options;
  const headers = new Headers(fetchOpts.headers as HeadersInit);
  if (!skipAuth) {
    const token = tokenStore.getAccess();
    if (token) headers.set("Authorization", "Bearer " + token);
  }
  if (adminSecret) headers.set("Authorization", "Bearer " + adminSecret);
  if (fetchOpts.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");

  const res = await fetch(API_BASE + path, { ...fetchOpts, headers });

  if (res.status === 401 && !skipAuth) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers.set("Authorization", "Bearer " + tokenStore.getAccess()!);
      const retried = await fetch(API_BASE + path, { ...fetchOpts, headers });
      if (!retried.ok) throw new ApiError(retried.status, await retried.text());
      if (retried.status === 204) return undefined as unknown as T;
      return retried.json() as Promise<T>;
    }
    tokenStore.clear();
    throw new ApiError(401, "Unauthorized");
  }

  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export const authApi = {
  register: (email: string, password: string) =>
    apiFetch<AuthResponse>("/api/auth/register", {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    apiFetch<AuthResponse>("/api/auth/login", {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify({ email, password }),
    }),
};

export const domainsApi = {
  list: () => apiFetch<{ domains: Domain[] }>("/api/domains"),
  add: (domain: string) =>
    apiFetch<{ domain: Domain; dnsRecords: DnsRecords }>("/api/domains", {
      method: "POST",
      body: JSON.stringify({ domain }),
    }),
  get: (id: string) => apiFetch<{ domain: Domain; dnsRecords: DnsRecords }>("/api/domains/" + id),
  verify: (id: string) =>
    apiFetch<{ domain: Domain; verified: boolean; checks: { mx: boolean; txt: boolean } }>(
      "/api/domains/" + id + "/verify",
      { method: "POST" },
    ),
  remove: (id: string) => apiFetch<void>("/api/domains/" + id, { method: "DELETE" }),
};

export const recipientsApi = {
  list: () => apiFetch<{ recipients: Recipient[] }>("/api/recipients"),
  add: (email: string) =>
    apiFetch<{
      recipient: Recipient;
      verificationToken: string;
      verificationSent?: boolean;
      expiresAt: string;
    }>("/api/recipients", { method: "POST", body: JSON.stringify({ email }) }),
  resendVerification: (id: string) =>
    apiFetch<{ verificationToken: string; verificationSent?: boolean; expiresAt: string }>(
      "/api/recipients/" + id + "/resend",
      { method: "POST" },
    ),
  verify: (id: string, token: string) =>
    apiFetch<{ recipient: Recipient }>("/api/recipients/" + id + "/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  remove: (id: string) => apiFetch<void>("/api/recipients/" + id, { method: "DELETE" }),
};

export const aliasesApi = {
  list: () => apiFetch<{ aliases: Alias[] }>("/api/aliases"),
  create: (input: {
    localPart?: string;
    serviceLabel?: string;
    domainId: string;
    recipientId: string;
    pgpMode?: "none" | "optional" | "required";
  }) =>
    apiFetch<{ alias: Alias; address: string; recipientEmail: string }>("/api/aliases", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  enable: (id: string) =>
    apiFetch<{ alias: Alias }>("/api/aliases/" + id + "/enable", { method: "POST" }),
  disable: (id: string) =>
    apiFetch<{ alias: Alias }>("/api/aliases/" + id + "/disable", { method: "POST" }),
  remove: (id: string) => apiFetch<void>("/api/aliases/" + id, { method: "DELETE" }),
  stats: () => apiFetch<AliasStats>("/api/aliases/stats"),
  failedDeliveries: (status?: string, page = 1, limit = 50) =>
    apiFetch<{ deliveries: FailedDelivery[]; page: number; limit: number }>(
      `/api/aliases/failed-deliveries?page=${page}&limit=${limit}${status ? "&status=" + encodeURIComponent(status) : ""}`,
    ),
};

export const smtpRelaysApi = {
  list: () => apiFetch<{ relays: SmtpRelay[] }>("/api/smtp-relays"),
  create: (input: SmtpRelayInput) =>
    apiFetch<{ relay: SmtpRelay }>("/api/smtp-relays", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (id: string, patch: Partial<SmtpRelayInput>) =>
    apiFetch<{ relay: SmtpRelay }>("/api/smtp-relays/" + id, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  test: (id: string) =>
    apiFetch<{ relay: SmtpRelay; ok: boolean }>("/api/smtp-relays/" + id + "/test", {
      method: "POST",
    }),
  remove: (id: string) => apiFetch<void>("/api/smtp-relays/" + id, { method: "DELETE" }),
};

export const adminApi = {
  getConfig: () => apiFetch<AdminConfig>("/api/admin/config"),
  setConfig: (platformDomain: string, resendApiKey: string, outboundProvider: "resend" | "ses") =>
    apiFetch<AdminConfig>("/api/admin/config", {
      method: "POST",
      body: JSON.stringify({ platformDomain, resendApiKey, outboundProvider }),
    }),
  stats: (adminSecret?: string) => apiFetch<AdminStats>("/api/admin/stats", { adminSecret }),
  users: (search = "", adminSecret?: string) =>
    apiFetch<{ users: AdminUser[] }>(`/api/admin/users?search=${encodeURIComponent(search)}`, {
      adminSecret,
    }),
  setUserStatus: (id: string, status: "active" | "suspended", adminSecret?: string) =>
    apiFetch<{ user: AdminUser }>(`/api/admin/users/${id}`, {
      method: "PATCH",
      adminSecret,
      body: JSON.stringify({ status }),
    }),
  setUserPlan: (id: string, plan: AccountPlan, adminSecret?: string) =>
    apiFetch<{ user: AdminUser }>(`/api/admin/users/${id}`, {
      method: "PATCH",
      adminSecret,
      body: JSON.stringify({ plan }),
    }),
  domains: (search = "", adminSecret?: string) =>
    apiFetch<{ domains: AdminDomain[] }>(
      `/api/admin/domains?search=${encodeURIComponent(search)}`,
      { adminSecret },
    ),
  setDomainStatus: (id: string, status: "active" | "suspended", adminSecret?: string) =>
    apiFetch<{ domain: AdminDomain }>(`/api/admin/domains/${id}`, {
      method: "PATCH",
      adminSecret,
      body: JSON.stringify({ status }),
    }),
  aliases: (search = "", adminSecret?: string) =>
    apiFetch<{ aliases: AdminAlias[] }>(`/api/admin/aliases?search=${encodeURIComponent(search)}`, {
      adminSecret,
    }),
  setAliasStatus: (id: string, status: "active" | "disabled", adminSecret?: string) =>
    apiFetch<{ alias: AdminAlias }>(`/api/admin/aliases/${id}`, {
      method: "PATCH",
      adminSecret,
      body: JSON.stringify({ status }),
    }),
  deleteAlias: (id: string, adminSecret?: string) =>
    apiFetch<void>(`/api/admin/aliases/${id}`, { method: "DELETE", adminSecret }),
  deliveries: (search = "", adminSecret?: string) =>
    apiFetch<{ deliveries: AdminDelivery[] }>(
      `/api/admin/deliveries?alias=${encodeURIComponent(search)}&recipient=${encodeURIComponent(search)}`,
      { adminSecret },
    ),
  auditLogs: (search = "", adminSecret?: string) =>
    apiFetch<{ auditLogs: AdminAuditLog[] }>(
      `/api/admin/audit-logs?action=${encodeURIComponent(search)}`,
      { adminSecret },
    ),
  reservedLocalParts: (search = "", adminSecret?: string) =>
    apiFetch<{ reservedLocalParts: ReservedLocalPart[] }>(
      `/api/admin/reserved-local-parts?search=${encodeURIComponent(search)}`,
      { adminSecret },
    ),
  createReservedLocalPart: (
    input: {
      localPart: string;
      domainId?: string | null;
      action: "reserve" | "allow";
      note?: string | null;
    },
    adminSecret?: string,
  ) =>
    apiFetch<{ reservedLocalPart: ReservedLocalPart }>("/api/admin/reserved-local-parts", {
      method: "POST",
      adminSecret,
      body: JSON.stringify(input),
    }),
  deleteReservedLocalPart: (id: string, adminSecret?: string) =>
    apiFetch<void>(`/api/admin/reserved-local-parts/${id}`, { method: "DELETE", adminSecret }),
};

export interface PgpKeyInfo {
  id: string;
  fingerprint: string;
  algorithm: string;
  expiresAt?: string | null;
  /** True when the key expires within 30 days. */
  isExpiringSoon: boolean;
  createdAt: string;
  updatedAt: string;
  publicKeyArmored?: string;
}

export const pgpApi = {
  getKey: (recipientId: string, full = false) =>
    apiFetch<{ pgpKey: PgpKeyInfo }>(
      `/api/recipients/${recipientId}/pgp-key${full ? "?full=true" : ""}`,
    ),
  uploadKey: (recipientId: string, publicKeyArmored: string) =>
    apiFetch<{ pgpKey: PgpKeyInfo }>(`/api/recipients/${recipientId}/pgp-key`, {
      method: "POST",
      body: JSON.stringify({ publicKeyArmored }),
    }),
  deleteKey: (recipientId: string) =>
    apiFetch<void>(`/api/recipients/${recipientId}/pgp-key`, { method: "DELETE" }),
  testDelivery: (recipientId: string) =>
    apiFetch<{ ok: boolean; message: string }>(
      `/api/recipients/${recipientId}/pgp-key/test-delivery`,
      {
        method: "POST",
      },
    ),
};

export const aliasesPgpApi = {
  setPgpMode: (aliasId: string, pgpMode: "none" | "optional" | "required") =>
    apiFetch<{ alias: Alias }>(`/api/aliases/${aliasId}`, {
      method: "PATCH",
      body: JSON.stringify({ pgpMode }),
    }),
};

export const plansApi = {
  me: () => apiFetch<PlanSummary>("/api/plans/me"),
  tiers: () => apiFetch<{ plans: Record<AccountPlan, PlanLimits> }>("/api/plans/tiers"),
};
