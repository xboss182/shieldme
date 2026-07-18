import { and, count, desc, eq, gte, ilike, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { aliases, auditLogs, domains, mailLogs, recipients, reservedLocalParts, users } from '../../db/schema.js';
import { emailForwardingQueue } from '../../queues/email-jobs.js';
import { isValidLocalPart, normalizeLocalPart } from '../aliases/local-part.js';

export class AdminError extends Error {
  constructor(message: string, public statusCode = 400) { super(message); }
}

type Actor = { type: 'admin' | 'system' | 'user'; id?: string | null };
const adminActor: Actor = { type: 'admin', id: 'admin-secret' };

export async function writeAuditLog(action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>, actor = adminActor) {
  await db.insert(auditLogs).values({ actorType: actor.type, actorId: actor.id ?? null, action, targetType, targetId, metadata: metadata ?? {} });
}

function page(input: unknown, fallback = 1) { const n = Number(input); return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback; }
function limit(input: unknown, fallback = 50) { const n = Number(input); return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 100) : fallback; }
function offset(p: number, l: number) { return (p - 1) * l; }

export async function listAdminUsers(query: { search?: string; page?: unknown; limit?: unknown }) {
  const p = page(query.page), l = limit(query.limit);
  const where = query.search ? ilike(users.email, `%${query.search}%`) : undefined;
  const rows = await db.select({ id: users.id, email: users.email, role: users.role, plan: users.plan, isActive: users.isActive, createdAt: users.createdAt, updatedAt: users.updatedAt, domainCount: sql<number>`count(distinct ${domains.id})::int`, recipientCount: sql<number>`count(distinct ${recipients.id})::int`, aliasCount: sql<number>`count(distinct ${aliases.id})::int` }).from(users).leftJoin(domains, eq(domains.ownerId, users.id)).leftJoin(recipients, eq(recipients.ownerId, users.id)).leftJoin(aliases, eq(aliases.ownerId, users.id)).where(where).groupBy(users.id).orderBy(desc(users.createdAt)).limit(l).offset(offset(p, l));
  return { users: rows, page: p, limit: l };
}

export async function getAdminUser(userId: string) {
  const [row] = await db.select({ id: users.id, email: users.email, role: users.role, plan: users.plan, isActive: users.isActive, createdAt: users.createdAt, updatedAt: users.updatedAt, domainCount: sql<number>`count(distinct ${domains.id})::int`, recipientCount: sql<number>`count(distinct ${recipients.id})::int`, aliasCount: sql<number>`count(distinct ${aliases.id})::int` }).from(users).leftJoin(domains, eq(domains.ownerId, users.id)).leftJoin(recipients, eq(recipients.ownerId, users.id)).leftJoin(aliases, eq(aliases.ownerId, users.id)).where(eq(users.id, userId)).groupBy(users.id);
  if (!row) throw new AdminError('User not found', 404);
  return row;
}

export async function adminSetUserStatus(userId: string, status: 'active' | 'suspended') {
  const row = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!row) throw new AdminError('User not found', 404);
  const [updated] = await db.update(users).set({ isActive: status === 'active', updatedAt: new Date() }).where(eq(users.id, userId)).returning();
  await writeAuditLog(status === 'active' ? 'user.unsuspended' : 'user.suspended', 'user', userId, { email: row.email });
  return updated;
}
export const adminDisableUser = (userId: string) => adminSetUserStatus(userId, 'suspended');
export const adminEnableUser = (userId: string) => adminSetUserStatus(userId, 'active');

export async function adminSetUserPlan(userId: string, plan: 'free' | 'basic' | 'pro' | 'business') {
  const row = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!row) throw new AdminError('User not found', 404);
  const [updated] = await db.update(users).set({ plan, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
  await writeAuditLog('user.plan_updated', 'user', userId, { email: row.email, previousPlan: row.plan ?? 'free', plan });
  return updated;
}


export async function listAdminDomains(query: { search?: string; status?: string; page?: unknown; limit?: unknown }) {
  const p = page(query.page), l = limit(query.limit);
  const filters = [];
  if (query.search) filters.push(ilike(domains.domain, `%${query.search}%`));
  if (query.status === 'active') filters.push(eq(domains.isActive, true));
  if (query.status === 'suspended') filters.push(eq(domains.isActive, false));
  const rows = await db.select({ id: domains.id, domain: domains.domain, status: domains.status, isActive: domains.isActive, ownerId: domains.ownerId, ownerEmail: users.email, createdAt: domains.createdAt, updatedAt: domains.updatedAt }).from(domains).leftJoin(users, eq(users.id, domains.ownerId)).where(filters.length ? and(...filters) : undefined).orderBy(desc(domains.createdAt)).limit(l).offset(offset(p, l));
  return { domains: rows, page: p, limit: l };
}

export async function adminSetDomainStatus(domainId: string, status: 'active' | 'suspended') {
  const row = await db.query.domains.findFirst({ where: eq(domains.id, domainId) });
  if (!row) throw new AdminError('Domain not found', 404);
  const [updated] = await db.update(domains).set({ isActive: status === 'active', updatedAt: new Date() }).where(eq(domains.id, domainId)).returning();
  await writeAuditLog(status === 'active' ? 'domain.unsuspended' : 'domain.suspended', 'domain', domainId, { domain: row.domain });
  return updated;
}
export const adminDisableDomain = (domainId: string) => adminSetDomainStatus(domainId, 'suspended');
export const adminEnableDomain = (domainId: string) => adminSetDomainStatus(domainId, 'active');

export async function listAdminAliases(query: { search?: string; status?: string; page?: unknown; limit?: unknown }) {
  const p = page(query.page), l = limit(query.limit);
  const filters = [];
  if (query.search) filters.push(sql`(${aliases.localPart} ilike ${`%${query.search}%`} or ${domains.domain} ilike ${`%${query.search}%`} or ${recipients.email} ilike ${`%${query.search}%`})`);
  if (query.status) filters.push(eq(aliases.status, query.status as any));
  const rows = await db.select({ id: aliases.id, localPart: aliases.localPart, status: aliases.status, pgpMode: aliases.pgpMode, ownerId: aliases.ownerId, ownerEmail: users.email, domainId: aliases.domainId, domain: domains.domain, recipientId: aliases.recipientId, recipientEmail: recipients.email, createdAt: aliases.createdAt, updatedAt: aliases.updatedAt }).from(aliases).leftJoin(users, eq(users.id, aliases.ownerId)).leftJoin(domains, eq(domains.id, aliases.domainId)).leftJoin(recipients, eq(recipients.id, aliases.recipientId)).where(filters.length ? and(...filters) : undefined).orderBy(desc(aliases.createdAt)).limit(l).offset(offset(p, l));
  return { aliases: rows, page: p, limit: l };
}

export async function adminSetAliasStatus(aliasId: string, status: 'active' | 'disabled') {
  const row = await db.query.aliases.findFirst({ where: eq(aliases.id, aliasId) });
  if (!row) throw new AdminError('Alias not found', 404);
  if (row.status === 'deleted') throw new AdminError('Alias is deleted', 410);
  const [updated] = await db.update(aliases).set({ status, updatedAt: new Date() }).where(eq(aliases.id, aliasId)).returning();
  await writeAuditLog(status === 'active' ? 'alias.admin_enabled' : 'alias.admin_disabled', 'alias', aliasId, { previousStatus: row.status });
  return updated;
}
export const adminDisableAlias = (aliasId: string) => adminSetAliasStatus(aliasId, 'disabled');
export const adminEnableAlias = (aliasId: string) => adminSetAliasStatus(aliasId, 'active');

export async function adminForceDeleteAlias(aliasId: string) {
  const row = await db.query.aliases.findFirst({ where: eq(aliases.id, aliasId) });
  if (!row) throw new AdminError('Alias not found', 404);
  const [updated] = await db.update(aliases).set({ status: 'deleted', updatedAt: new Date() }).where(eq(aliases.id, aliasId)).returning();
  await writeAuditLog('alias.force_deleted', 'alias', aliasId, { previousStatus: row.status });
  return updated;
}

export async function listAuditLogs(query: { action?: string; targetType?: string; actorType?: string; page?: unknown; limit?: unknown }) {
  const p = page(query.page), l = limit(query.limit);
  const filters = [];
  if (query.action) filters.push(ilike(auditLogs.action, `%${query.action}%`));
  if (query.targetType) filters.push(eq(auditLogs.targetType, query.targetType));
  if (query.actorType) filters.push(eq(auditLogs.actorType, query.actorType as any));
  const rows = await db.select().from(auditLogs).where(filters.length ? and(...filters) : undefined).orderBy(desc(auditLogs.timestamp)).limit(l).offset(offset(p, l));
  return { auditLogs: rows, page: p, limit: l };
}

export async function listDeliveries(query: { status?: string; alias?: string; recipient?: string; page?: unknown; limit?: unknown }) {
  const p = page(query.page), l = limit(query.limit);
  const filters = [];
  if (query.status) filters.push(eq(mailLogs.status, query.status as any));
  if (query.alias) filters.push(sql`(${aliases.localPart} ilike ${`%${query.alias}%`} or ${domains.domain} ilike ${`%${query.alias}%`} or ${mailLogs.envelopeTo} ilike ${`%${query.alias}%`})`);
  if (query.recipient) filters.push(ilike(mailLogs.forwardedTo, `%${query.recipient}%`));
  const rows = await db.select({ id: mailLogs.id, aliasId: mailLogs.aliasId, aliasLocalPart: aliases.localPart, aliasDomain: domains.domain, envelopeFrom: mailLogs.envelopeFrom, envelopeTo: mailLogs.envelopeTo, forwardedTo: mailLogs.forwardedTo, status: mailLogs.status, errorMessage: mailLogs.rejectionReason, pgpModeUsed: aliases.pgpMode, sizeBytes: mailLogs.sizeBytes, createdAt: mailLogs.createdAt, updatedAt: mailLogs.updatedAt }).from(mailLogs).leftJoin(aliases, eq(aliases.id, mailLogs.aliasId)).leftJoin(domains, eq(domains.id, aliases.domainId)).where(filters.length ? and(...filters) : undefined).orderBy(desc(mailLogs.createdAt)).limit(l).offset(offset(p, l));
  return { deliveries: rows, page: p, limit: l };
}

async function deliveryCountsSince(since: Date) {
  const rows = await db.select({ status: mailLogs.status, count: count() }).from(mailLogs).where(gte(mailLogs.createdAt, since)).groupBy(mailLogs.status);
  return rows.reduce<Record<string, number>>((acc, row) => { acc[row.status] = Number(row.count); return acc; }, { queued: 0, delivered: 0, failed: 0, rejected: 0 });
}

export async function getAdminStats() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [[userCount], [domainCount], [recipientCount], [aliasCount], [activeUsers], [suspendedUsers], [activeDomains], [suspendedDomains], [activeAliases], [pgpRows], last24h, last7d, last30d] = await Promise.all([
    db.select({ count: count() }).from(users),
    db.select({ count: count() }).from(domains),
    db.select({ count: count() }).from(recipients),
    db.select({ count: count() }).from(aliases),
    db.select({ count: count() }).from(users).where(eq(users.isActive, true)),
    db.select({ count: count() }).from(users).where(eq(users.isActive, false)),
    db.select({ count: count() }).from(domains).where(eq(domains.isActive, true)),
    db.select({ count: count() }).from(domains).where(eq(domains.isActive, false)),
    db.select({ count: count() }).from(aliases).where(eq(aliases.status, 'active')),
    db.select({ count: count() }).from(mailLogs).where(eq(mailLogs.pgpEncrypted, true)),
    deliveryCountsSince(since24h), deliveryCountsSince(since7d), deliveryCountsSince(since30d),
  ]);
  const queue = await emailForwardingQueue.getJobCounts('waiting', 'delayed', 'active', 'failed', 'completed');
  return {
    totals: { users: userCount.count, domains: domainCount.count, recipients: recipientCount.count, aliases: aliasCount.count },
    users: { total: userCount.count, active: activeUsers.count, suspended: suspendedUsers.count },
    domains: { total: domainCount.count, active: activeDomains.count, suspended: suspendedDomains.count },
    aliases: { total: aliasCount.count, active: activeAliases.count },
    active: { users: activeUsers.count, domains: activeDomains.count, aliases: activeAliases.count },
    suspended: { users: suspendedUsers.count, domains: suspendedDomains.count },
    deliveries: { last24h, last7d, last30d, pgpEncrypted: pgpRows.count },
    pgpEncryptedDeliveries: pgpRows.count,
    queueDepth: queue,
    queue: { depth: (queue.waiting ?? 0) + (queue.delayed ?? 0), ...queue },
  };
}


export async function listReservedLocalParts(query: { search?: string; domainId?: string; action?: string; page?: unknown; limit?: unknown }) {
  const p = page(query.page), l = limit(query.limit);
  const filters = [];
  if (query.search) filters.push(ilike(reservedLocalParts.localPart, `%${query.search}%`));
  if (query.domainId) filters.push(eq(reservedLocalParts.domainId, query.domainId));
  if (query.action === 'reserve' || query.action === 'allow') filters.push(eq(reservedLocalParts.action, query.action));
  const where = filters.length ? and(...filters) : undefined;
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({ id: reservedLocalParts.id, localPart: reservedLocalParts.localPart, domainId: reservedLocalParts.domainId, domain: domains.domain, action: reservedLocalParts.action, note: reservedLocalParts.note, sourceBatch: reservedLocalParts.sourceBatch, sourceSha256: reservedLocalParts.sourceSha256, createdAt: reservedLocalParts.createdAt, updatedAt: reservedLocalParts.updatedAt })
      .from(reservedLocalParts)
      .leftJoin(domains, eq(domains.id, reservedLocalParts.domainId))
      .where(where)
      .orderBy(reservedLocalParts.localPart, reservedLocalParts.domainId)
      .limit(l)
      .offset(offset(p, l)),
    db.select({ count: count() }).from(reservedLocalParts).where(where),
  ]);
  return { reservedLocalParts: rows, page: p, limit: l, total: Number(totalRow?.count ?? 0) };
}

export async function createReservedLocalPart(input: { localPart: string; domainId?: string | null; action: 'reserve' | 'allow'; note?: string | null }) {
  const localPart = normalizeLocalPart(input.localPart);
  if (!isValidLocalPart(localPart)) throw new AdminError('Invalid local-part', 400);
  const [row] = await db.insert(reservedLocalParts).values({ localPart, domainId: input.domainId ?? null, action: input.action, note: input.note ?? null }).returning();
  await writeAuditLog(input.action === 'allow' ? 'reserved_alias.allowed' : 'reserved_alias.reserved', 'reserved_local_part', row.id, { localPart, domainId: row.domainId, note: row.note });
  return row;
}

export async function deleteReservedLocalPart(id: string) {
  const row = await db.query.reservedLocalParts.findFirst({ where: eq(reservedLocalParts.id, id) });
  if (!row) throw new AdminError('Reserved local-part rule not found', 404);
  await db.delete(reservedLocalParts).where(eq(reservedLocalParts.id, id));
  await writeAuditLog('reserved_alias.deleted', 'reserved_local_part', id, { localPart: row.localPart, domainId: row.domainId, action: row.action });
}
