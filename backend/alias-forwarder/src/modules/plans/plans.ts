import { and, count, eq, gte, ne } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { aliases, domains, mailLogs, recipients, users } from '../../db/schema.js';
import { getOutboundProvider } from '../../config/runtime-config.js';

export const accountPlans = ['free', 'basic', 'pro', 'business'] as const;
export type AccountPlan = typeof accountPlans[number];

export interface PlanLimits {
  maxDomains: number;
  maxAliases: number;
  maxRecipients: number;
  monthlyForwards: number;
  pgpEnabled: boolean;
  customOutboundProvider: boolean;
  billingEnabled: boolean;
}

export const PLAN_LIMITS: Record<AccountPlan, PlanLimits> = {
  free: { maxDomains: 1, maxAliases: 5, maxRecipients: 1, monthlyForwards: 100, pgpEnabled: false, customOutboundProvider: false, billingEnabled: false },
  basic: { maxDomains: 3, maxAliases: 50, maxRecipients: 5, monthlyForwards: 2_000, pgpEnabled: false, customOutboundProvider: false, billingEnabled: true },
  pro: { maxDomains: 10, maxAliases: 500, maxRecipients: 25, monthlyForwards: 20_000, pgpEnabled: true, customOutboundProvider: true, billingEnabled: true },
  business: { maxDomains: 50, maxAliases: 5_000, maxRecipients: 250, monthlyForwards: 250_000, pgpEnabled: true, customOutboundProvider: true, billingEnabled: true },
};

export class PlanLimitError extends Error {
  constructor(message: string, public statusCode = 402) { super(message); }
}

function normalisePlan(plan: string | null | undefined): AccountPlan {
  return accountPlans.includes(plan as AccountPlan) ? plan as AccountPlan : 'free';
}

export async function getUserPlan(userId: string): Promise<AccountPlan> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { plan: true } });
  return normalisePlan(user?.plan);
}

export async function getUserPlanSummary(userId: string) {
  const plan = await getUserPlan(userId);
  const limits = PLAN_LIMITS[plan];
  const monthStart = new Date();
  monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const [[domainCount], [recipientCount], [aliasCount], [monthlyForwardCount]] = await Promise.all([
    db.select({ count: count() }).from(domains).where(eq(domains.ownerId, userId)),
    db.select({ count: count() }).from(recipients).where(eq(recipients.ownerId, userId)),
    db.select({ count: count() }).from(aliases).where(and(eq(aliases.ownerId, userId), ne(aliases.status, 'deleted'))),
    db.select({ count: count() }).from(mailLogs).leftJoin(aliases, eq(aliases.id, mailLogs.aliasId)).where(and(eq(aliases.ownerId, userId), gte(mailLogs.createdAt, monthStart), eq(mailLogs.status, 'delivered'))),
  ]);
  return {
    plan,
    limits,
    usage: {
      domains: Number(domainCount.count),
      recipients: Number(recipientCount.count),
      aliases: Number(aliasCount.count),
      monthlyForwards: Number(monthlyForwardCount.count),
    },
  };
}

export async function assertCanCreateDomain(userId: string) {
  const { plan, limits, usage } = await getUserPlanSummary(userId);
  if (usage.domains >= limits.maxDomains) throw new PlanLimitError(`${plan} plan allows ${limits.maxDomains} domain(s). Upgrade to add more.`);
}
export async function assertCanCreateRecipient(userId: string) {
  const { plan, limits, usage } = await getUserPlanSummary(userId);
  if (usage.recipients >= limits.maxRecipients) throw new PlanLimitError(`${plan} plan allows ${limits.maxRecipients} recipient(s). Upgrade to add more.`);
}
export async function assertCanCreateAlias(userId: string) {
  const { plan, limits, usage } = await getUserPlanSummary(userId);
  if (usage.aliases >= limits.maxAliases) throw new PlanLimitError(`${plan} plan allows ${limits.maxAliases} alias(es). Upgrade to add more.`);
}
export async function assertPgpAllowed(userId: string) {
  const { plan, limits } = await getUserPlanSummary(userId);
  if (!limits.pgpEnabled) throw new PlanLimitError(`${plan} plan does not include PGP encryption. Upgrade to Pro or Business.`);
}
export async function assertOutboundProviderAllowed(userId: string) {
  const provider = getOutboundProvider();
  if (provider === 'resend') return;
  const { plan, limits } = await getUserPlanSummary(userId);
  if (!limits.customOutboundProvider) throw new PlanLimitError(`${plan} plan does not include custom outbound providers. Upgrade to Pro or Business.`);
}
export async function assertMonthlyForwardAllowed(userId: string) {
  const { plan, limits, usage } = await getUserPlanSummary(userId);
  if (usage.monthlyForwards >= limits.monthlyForwards) throw new PlanLimitError(`${plan} monthly forwarding limit reached (${limits.monthlyForwards}).`, 429);
}
