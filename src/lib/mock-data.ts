// Mock data mirroring the ShieldMail API shapes. UI-only — no backend.

export type DomainStatus = "verified" | "pending" | "failed";
export type PgpMode = "none" | "optional" | "required";

export type DnsRecord = {
  type: string;
  name: string;
  value: string;
  priority?: number;
  note?: string;
};

export type Domain = {
  id: string;
  domain: string;
  status: DomainStatus;
  isActive: boolean;
  isShared: boolean;
  dkimSelector: string;
  verifiedAt: string | null;
  createdAt: string;
  dnsRecords: {
    required: DnsRecord[];
    optional: DnsRecord[];
  };
};

export type PgpKeyInfo = {
  fingerprint: string;
  algorithm: string;
  expiresAt?: string;
  isExpiringSoon: boolean;
  createdAt: string;
};

export type Recipient = {
  id: string;
  email: string;
  status: "verified" | "pending";
  isActive: boolean;
  verifiedAt: string | null;
  createdAt: string;
  pgpKey: PgpKeyInfo | null;
};

export type Alias = {
  id: string;
  label: string;
  localPart: string;
  domainId: string;
  domain: string;
  recipientId: string;
  recipientEmail: string;
  status: "active" | "disabled";
  pgpMode: PgpMode;
  verificationCode: string;
  createdAt: string;
  stats: {
    forwarded: number;
    blocked: number;
    failed: number;
    spamTagged: number;
    spamRejected: number;
  };
};

export type FailedDelivery = {
  id: string;
  aliasLocalPart: string;
  aliasDomain: string;
  envelopeFrom: string;
  status: "failed" | "bounced" | "complained" | "rejected";
  failureType: string;
  failureReason: string;
  outboundProvider: string;
  createdAt: string;
};

export type AccountPlan = "free" | "basic" | "pro";

export type PlanTier = {
  id: AccountPlan;
  eyebrow: string;
  name: string;
  price: string;
  period: string;
  note: string;
  description: string;
  features: string[];
  featured?: boolean;
  limits: {
    maxDomains: number;
    maxAliases: number;
    maxRecipients: number;
    monthlyForwards: number;
    pgpEnabled: boolean;
    customOutboundProvider: boolean;
  };
};

export type AdminUser = {
  id: string;
  email: string;
  role: "admin" | "user";
  plan: AccountPlan;
  isActive: boolean;
  domainCount: number;
  recipientCount: number;
  aliasCount: number;
  createdAt: string;
};

export type AdminDomain = {
  id: string;
  domain: string;
  ownerEmail: string;
  status: DomainStatus;
  isActive: boolean;
};

export type AdminAlias = {
  id: string;
  localPart: string;
  domain: string;
  recipientEmail: string;
  status: "active" | "disabled";
  pgpMode: PgpMode;
};

export type AdminDelivery = {
  id: string;
  alias: string;
  recipient: string;
  status: "delivered" | "failed" | "rejected";
  reasonCode: string;
  pgpMode: PgpMode;
  createdAt: string;
};

export type AuditLog = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  actor: string;
  timestamp: string;
};

export type ReservedLocalPart = {
  id: string;
  localPart: string;
  domain: string | null;
  action: "reserve" | "allow";
  note: string;
  sourceBatch: string | null;
};

export const currentUser = {
  email: "operator@shieldme.cc",
  role: "admin" as const,
  plan: "pro" as AccountPlan,
};

const dns = (domain: string, selector: string) => ({
  required: [
    {
      type: "MX",
      name: domain,
      value: "inbound.shieldme.cc",
      priority: 10,
      note: "Routes inbound mail into the ShieldMail filter pipeline.",
    },
    {
      type: "TXT",
      name: `_shieldme.${domain}`,
      value: `shieldme-verify=${selector}-4f8a2c17d9`,
      note: "Ownership proof. Keep this record in place permanently.",
    },
  ],
  optional: [
    {
      type: "TXT",
      name: domain,
      value: "v=spf1 include:spf.shieldme.cc ~all",
      note: "SPF — authorises ShieldMail to send on your behalf.",
    },
    {
      type: "TXT",
      name: `${selector}._domainkey.${domain}`,
      value: "v=DKIM1; k=rsa; p=MIIBIjANBgkqh...QIDAQAB",
      note: "DKIM — signs outbound forwards.",
    },
    {
      type: "TXT",
      name: `_dmarc.${domain}`,
      value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@shieldme.cc",
      note: "DMARC — reporting and policy enforcement.",
    },
  ],
});

export const domains: Domain[] = [
  {
    id: "dom_shared",
    domain: "shieldme.cc",
    status: "verified",
    isActive: true,
    isShared: true,
    dkimSelector: "sm1",
    verifiedAt: "2026-01-04T09:12:00Z",
    createdAt: "2026-01-04T09:10:00Z",
    dnsRecords: dns("shieldme.cc", "sm1"),
  },
  {
    id: "dom_1",
    domain: "hallow.email",
    status: "verified",
    isActive: true,
    isShared: false,
    dkimSelector: "sm2",
    verifiedAt: "2026-02-18T14:41:00Z",
    createdAt: "2026-02-18T14:02:00Z",
    dnsRecords: dns("hallow.email", "sm2"),
  },
  {
    id: "dom_2",
    domain: "kestrel.works",
    status: "pending",
    isActive: false,
    isShared: false,
    dkimSelector: "sm3",
    verifiedAt: null,
    createdAt: "2026-07-11T08:30:00Z",
    dnsRecords: dns("kestrel.works", "sm3"),
  },
  {
    id: "dom_3",
    domain: "oldmail.co.uk",
    status: "failed",
    isActive: false,
    isShared: false,
    dkimSelector: "sm4",
    verifiedAt: null,
    createdAt: "2026-06-02T17:22:00Z",
    dnsRecords: dns("oldmail.co.uk", "sm4"),
  },
];

export const recipients: Recipient[] = [
  {
    id: "rcp_1",
    email: "personal.inbox@gmail.com",
    status: "verified",
    isActive: true,
    verifiedAt: "2026-01-05T10:00:00Z",
    createdAt: "2026-01-05T09:58:00Z",
    pgpKey: {
      fingerprint: "9F2A17C4E80B51D3",
      algorithm: "RSA 4096",
      expiresAt: "2027-03-14T00:00:00Z",
      isExpiringSoon: false,
      createdAt: "2026-01-06T11:20:00Z",
    },
  },
  {
    id: "rcp_2",
    email: "vault@fastmail.net",
    status: "verified",
    isActive: true,
    verifiedAt: "2026-03-22T19:14:00Z",
    createdAt: "2026-03-22T19:10:00Z",
    pgpKey: {
      fingerprint: "3B77D0951AC6F82E",
      algorithm: "Curve25519",
      expiresAt: "2026-08-30T00:00:00Z",
      isExpiringSoon: true,
      createdAt: "2026-03-23T08:02:00Z",
    },
  },
  {
    id: "rcp_3",
    email: "work.backup@co.uk",
    status: "pending",
    isActive: false,
    verifiedAt: null,
    createdAt: "2026-07-19T12:45:00Z",
    pgpKey: null,
  },
];

const mkAlias = (
  id: string,
  label: string,
  localPart: string,
  domainId: string,
  domain: string,
  recipientId: string,
  recipientEmail: string,
  status: Alias["status"],
  pgpMode: PgpMode,
  createdAt: string,
  stats: Alias["stats"],
): Alias => ({
  id,
  label,
  localPart,
  domainId,
  domain,
  recipientId,
  recipientEmail,
  status,
  pgpMode,
  verificationCode: `SM-${id.slice(-3).toUpperCase()}-${localPart.slice(-4).toUpperCase()}`,
  createdAt,
  stats,
});

export const aliases: Alias[] = [
  mkAlias("als_01", "Shopping", "shopping.xk89", "dom_shared", "shieldme.cc", "rcp_1", "personal.inbox@gmail.com", "active", "required", "2026-07-21T09:14:00Z", { forwarded: 142, blocked: 0, failed: 0, spamTagged: 12, spamRejected: 4 }),
  mkAlias("als_02", "Newsletters", "news.v8s2", "dom_shared", "shieldme.cc", "rcp_1", "personal.inbox@gmail.com", "active", "none", "2026-07-18T16:02:00Z", { forwarded: 84, blocked: 3, failed: 1, spamTagged: 0, spamRejected: 9 }),
  mkAlias("als_03", "Signup throwaway", "signup.p04q", "dom_1", "hallow.email", "rcp_2", "vault@fastmail.net", "active", "optional", "2026-07-14T11:38:00Z", { forwarded: 39, blocked: 1, failed: 0, spamTagged: 4, spamRejected: 1 }),
  mkAlias("als_04", "Legacy service", "old.service.q12", "dom_1", "hallow.email", "rcp_3", "work.backup@co.uk", "disabled", "none", "2026-05-02T07:20:00Z", { forwarded: 0, blocked: 0, failed: 0, spamTagged: 0, spamRejected: 0 }),
  mkAlias("als_05", "Banking", "bank.t71z", "dom_1", "hallow.email", "rcp_2", "vault@fastmail.net", "active", "required", "2026-06-28T13:55:00Z", { forwarded: 61, blocked: 0, failed: 2, spamTagged: 1, spamRejected: 0 }),
  mkAlias("als_06", "Conference", "conf.m4d0", "dom_shared", "shieldme.cc", "rcp_1", "personal.inbox@gmail.com", "active", "none", "2026-06-11T10:05:00Z", { forwarded: 27, blocked: 6, failed: 0, spamTagged: 18, spamRejected: 22 }),
  mkAlias("als_07", "Recruiters", "hire.k39w", "dom_1", "hallow.email", "rcp_1", "personal.inbox@gmail.com", "active", "optional", "2026-05-30T15:41:00Z", { forwarded: 118, blocked: 2, failed: 0, spamTagged: 7, spamRejected: 3 }),
  mkAlias("als_08", "Marketplace", "market.z28c", "dom_shared", "shieldme.cc", "rcp_2", "vault@fastmail.net", "active", "none", "2026-05-14T09:09:00Z", { forwarded: 203, blocked: 11, failed: 3, spamTagged: 44, spamRejected: 31 }),
  mkAlias("als_09", "Support tickets", "support.a5n1", "dom_1", "hallow.email", "rcp_1", "personal.inbox@gmail.com", "active", "none", "2026-04-27T18:26:00Z", { forwarded: 75, blocked: 0, failed: 0, spamTagged: 2, spamRejected: 0 }),
  mkAlias("als_10", "Old newsletter", "digest.r6y4", "dom_shared", "shieldme.cc", "rcp_1", "personal.inbox@gmail.com", "disabled", "none", "2026-03-19T20:13:00Z", { forwarded: 12, blocked: 0, failed: 0, spamTagged: 30, spamRejected: 12 }),
  mkAlias("als_11", "Travel", "travel.w0e7", "dom_1", "hallow.email", "rcp_2", "vault@fastmail.net", "active", "optional", "2026-03-02T06:48:00Z", { forwarded: 46, blocked: 1, failed: 1, spamTagged: 3, spamRejected: 2 }),
  mkAlias("als_12", "Utilities", "utils.h83b", "dom_shared", "shieldme.cc", "rcp_1", "personal.inbox@gmail.com", "active", "required", "2026-02-08T12:31:00Z", { forwarded: 90, blocked: 0, failed: 0, spamTagged: 0, spamRejected: 1 }),
];

export const failedDeliveries: FailedDelivery[] = [
  { id: "fd_1", aliasLocalPart: "market.z28c", aliasDomain: "shieldme.cc", envelopeFrom: "orders@marketplace.io", status: "bounced", failureType: "mailbox_full", failureReason: "Recipient mailbox is over quota", outboundProvider: "resend", createdAt: "2026-07-25T08:12:00Z" },
  { id: "fd_2", aliasLocalPart: "bank.t71z", aliasDomain: "hallow.email", envelopeFrom: "alerts@bank.example", status: "rejected", failureType: "pgp_key_required", failureReason: "PGP required but recipient key missing", outboundProvider: "resend", createdAt: "2026-07-24T21:03:00Z" },
  { id: "fd_3", aliasLocalPart: "news.v8s2", aliasDomain: "shieldme.cc", envelopeFrom: "digest@newsroom.com", status: "complained", failureType: "spam_report", failureReason: "Recipient marked message as spam", outboundProvider: "ses", createdAt: "2026-07-24T09:47:00Z" },
  { id: "fd_4", aliasLocalPart: "market.z28c", aliasDomain: "shieldme.cc", envelopeFrom: "no-reply@shipping.net", status: "failed", failureType: "loop_sender", failureReason: "Forwarding loop detected", outboundProvider: "resend", createdAt: "2026-07-23T17:29:00Z" },
  { id: "fd_5", aliasLocalPart: "travel.w0e7", aliasDomain: "hallow.email", envelopeFrom: "itinerary@flights.example", status: "bounced", failureType: "unknown_user", failureReason: "550 5.1.1 user unknown", outboundProvider: "ses", createdAt: "2026-07-22T11:58:00Z" },
  { id: "fd_6", aliasLocalPart: "bank.t71z", aliasDomain: "hallow.email", envelopeFrom: "statements@bank.example", status: "failed", failureType: "size_limit", failureReason: "Message exceeds 25 MB relay limit", outboundProvider: "resend", createdAt: "2026-07-21T14:22:00Z" },
  { id: "fd_7", aliasLocalPart: "conf.m4d0", aliasDomain: "shieldme.cc", envelopeFrom: "spam@bulk.example", status: "rejected", failureType: "spam_policy", failureReason: "Blocked by inbound spam policy", outboundProvider: "resend", createdAt: "2026-07-20T06:14:00Z" },
  { id: "fd_8", aliasLocalPart: "news.v8s2", aliasDomain: "shieldme.cc", envelopeFrom: "promo@retail.example", status: "complained", failureType: "spam_report", failureReason: "Feedback loop complaint received", outboundProvider: "ses", createdAt: "2026-07-19T19:40:00Z" },
  { id: "fd_9", aliasLocalPart: "market.z28c", aliasDomain: "shieldme.cc", envelopeFrom: "returns@marketplace.io", status: "failed", failureType: "relay_timeout", failureReason: "Upstream relay timed out after 30s", outboundProvider: "resend", createdAt: "2026-07-18T02:55:00Z" },
];

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

export const planTiers: PlanTier[] = [
  {
    id: "free",
    eyebrow: "Starter",
    name: "Free",
    price: "$0",
    period: "/month",
    note: "No card required",
    description: "Try aliasing on the shared shieldme.cc domain.",
    features: ["1 shared domain", "10 aliases", "1 recipient", "PGP encryption included", "Spam filtering"],
    limits: { maxDomains: 1, maxAliases: 10, maxRecipients: 1, monthlyForwards: 500, pgpEnabled: true, customOutboundProvider: false },
  },
  {
    id: "basic",
    eyebrow: "Everyday",
    name: "Basic",
    price: "$4",
    period: "/month",
    note: "Billed annually",
    description: "Bring your own domain and split mail across inboxes.",
    features: ["2 custom domains", "100 aliases", "3 recipients", "PGP encryption included", "Failed delivery log"],
    featured: true,
    limits: { maxDomains: 2, maxAliases: 100, maxRecipients: 3, monthlyForwards: 10000, pgpEnabled: true, customOutboundProvider: false },
  },
  {
    id: "pro",
    eyebrow: "Power user",
    name: "Shield",
    price: "$12",
    period: "/month",
    note: "Billed annually",
    description: "Unlimited-scale aliasing with your own outbound provider.",
    features: ["10 custom domains", "1,000 aliases", "10 recipients", "Custom outbound provider", "Priority delivery queue", "Full audit history"],
    limits: { maxDomains: 10, maxAliases: 1000, maxRecipients: 10, monthlyForwards: 100000, pgpEnabled: true, customOutboundProvider: true },
  },
];

export const planSummary = {
  plan: "pro" as AccountPlan,
  usage: { domains: 3, aliases: 12, recipients: 3, monthlyForwards: 12492 },
};

export const adminUsers: AdminUser[] = [
  { id: "usr_1", email: "operator@shieldme.cc", role: "admin", plan: "pro", isActive: true, domainCount: 3, recipientCount: 3, aliasCount: 12, createdAt: "2026-01-04T09:00:00Z" },
  { id: "usr_2", email: "dana.oyelaran@proton.me", role: "user", plan: "basic", isActive: true, domainCount: 1, recipientCount: 2, aliasCount: 34, createdAt: "2026-02-11T13:20:00Z" },
  { id: "usr_3", email: "kai@northbridge.dev", role: "user", plan: "pro", isActive: true, domainCount: 4, recipientCount: 5, aliasCount: 187, createdAt: "2026-03-01T08:05:00Z" },
  { id: "usr_4", email: "spamfarm@tempbox.ru", role: "user", plan: "free", isActive: false, domainCount: 0, recipientCount: 1, aliasCount: 9, createdAt: "2026-05-19T22:41:00Z" },
  { id: "usr_5", email: "m.tanaka@kaisha.jp", role: "user", plan: "free", isActive: true, domainCount: 0, recipientCount: 1, aliasCount: 6, createdAt: "2026-06-07T05:30:00Z" },
  { id: "usr_6", email: "ops@atlasfreight.com", role: "user", plan: "basic", isActive: true, domainCount: 2, recipientCount: 3, aliasCount: 71, createdAt: "2026-06-24T16:12:00Z" },
];

export const adminDomains: AdminDomain[] = [
  { id: "adm_dom_1", domain: "hallow.email", ownerEmail: "operator@shieldme.cc", status: "verified", isActive: true },
  { id: "adm_dom_2", domain: "northbridge.dev", ownerEmail: "kai@northbridge.dev", status: "verified", isActive: true },
  { id: "adm_dom_3", domain: "atlasfreight.com", ownerEmail: "ops@atlasfreight.com", status: "pending", isActive: true },
  { id: "adm_dom_4", domain: "tempbox.ru", ownerEmail: "spamfarm@tempbox.ru", status: "failed", isActive: false },
];

export const adminAliases: AdminAlias[] = [
  { id: "adm_al_1", localPart: "shopping.xk89", domain: "shieldme.cc", recipientEmail: "personal.inbox@gmail.com", status: "active", pgpMode: "required" },
  { id: "adm_al_2", localPart: "billing.d21x", domain: "northbridge.dev", recipientEmail: "kai@northbridge.dev", status: "active", pgpMode: "optional" },
  { id: "adm_al_3", localPart: "blast.9910", domain: "tempbox.ru", recipientEmail: "spamfarm@tempbox.ru", status: "disabled", pgpMode: "none" },
  { id: "adm_al_4", localPart: "dispatch.k02", domain: "atlasfreight.com", recipientEmail: "ops@atlasfreight.com", status: "active", pgpMode: "none" },
  { id: "adm_al_5", localPart: "invoices.p7t", domain: "hallow.email", recipientEmail: "vault@fastmail.net", status: "active", pgpMode: "required" },
];

export const adminDeliveries: AdminDelivery[] = [
  { id: "adm_dl_1", alias: "shopping.xk89@shieldme.cc", recipient: "personal.inbox@gmail.com", status: "delivered", reasonCode: "none", pgpMode: "required", createdAt: "2026-07-26T07:41:00Z" },
  { id: "adm_dl_2", alias: "blast.9910@tempbox.ru", recipient: "spamfarm@tempbox.ru", status: "rejected", reasonCode: "spam_policy", pgpMode: "none", createdAt: "2026-07-26T06:12:00Z" },
  { id: "adm_dl_3", alias: "invoices.p7t@hallow.email", recipient: "vault@fastmail.net", status: "failed", reasonCode: "pgp_key_required", pgpMode: "required", createdAt: "2026-07-25T23:08:00Z" },
  { id: "adm_dl_4", alias: "dispatch.k02@atlasfreight.com", recipient: "ops@atlasfreight.com", status: "failed", reasonCode: "loop_sender", pgpMode: "none", createdAt: "2026-07-25T18:55:00Z" },
  { id: "adm_dl_5", alias: "billing.d21x@northbridge.dev", recipient: "kai@northbridge.dev", status: "delivered", reasonCode: "none", pgpMode: "optional", createdAt: "2026-07-25T12:30:00Z" },
];

export const auditLogs: AuditLog[] = [
  { id: "log_1", action: "user.plan_changed", targetType: "user", targetId: "usr_3", actor: "operator@shieldme.cc", timestamp: "2026-07-26T07:02:00Z" },
  { id: "log_2", action: "domain.suspended", targetType: "domain", targetId: "adm_dom_4", actor: "operator@shieldme.cc", timestamp: "2026-07-25T20:44:00Z" },
  { id: "log_3", action: "alias.deleted", targetType: "alias", targetId: "adm_al_9", actor: "system", timestamp: "2026-07-25T14:19:00Z" },
  { id: "log_4", action: "reserved.rule_added", targetType: "reserved_local_part", targetId: "res_3", actor: "operator@shieldme.cc", timestamp: "2026-07-24T10:37:00Z" },
  { id: "log_5", action: "user.suspended", targetType: "user", targetId: "usr_4", actor: "operator@shieldme.cc", timestamp: "2026-07-23T09:15:00Z" },
  { id: "log_6", action: "config.updated", targetType: "config", targetId: "platform", actor: "operator@shieldme.cc", timestamp: "2026-07-22T16:48:00Z" },
  { id: "log_7", action: "alias.disabled", targetType: "alias", targetId: "adm_al_3", actor: "operator@shieldme.cc", timestamp: "2026-07-21T11:26:00Z" },
  { id: "log_8", action: "recipient.verified", targetType: "recipient", targetId: "rcp_2", actor: "system", timestamp: "2026-07-20T08:03:00Z" },
];

export const reservedLocalParts: ReservedLocalPart[] = [
  { id: "res_1", localPart: "admin", domain: null, action: "reserve", note: "Reserved system mailbox", sourceBatch: "core-2026-01" },
  { id: "res_2", localPart: "postmaster", domain: null, action: "reserve", note: "RFC 5321 requirement", sourceBatch: "core-2026-01" },
  { id: "res_3", localPart: "abuse", domain: null, action: "reserve", note: "Abuse desk routing", sourceBatch: null },
  { id: "res_4", localPart: "support", domain: "hallow.email", action: "allow", note: "Owner-approved exception", sourceBatch: null },
  { id: "res_5", localPart: "billing", domain: "northbridge.dev", action: "reserve", note: "Phishing risk", sourceBatch: "risk-2026-06" },
];

export const adminStats = {
  users: 6,
  domains: 4,
  aliases: 319,
  queueDepth: 12,
  pgpDeliveries: 1_842,
};

export const platformConfig = {
  platformDomain: "shieldme.cc",
  outboundProvider: "resend",
  forwardingEnabled: true,
  resendConfigured: true,
};

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
