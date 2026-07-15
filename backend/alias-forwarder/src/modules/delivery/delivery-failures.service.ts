import { and, desc, eq, count } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { deliveryFailureLog, aliases, suppressionList } from '../../db/schema.js';

/**
 * List delivery failures for a specific alias (user-facing, no body material).
 * Returns alias, recipient, provider, reason, failureDetail, timestamp.
 */
export async function listAliasDeliveryFailures(aliasId: string, ownerId: string, opts: { limit?: number; offset?: number } = {}) {
  const l = Math.min(opts.limit ?? 50, 100);
  const o = opts.offset ?? 0;

  // Verify that the alias belongs to the owner
  const alias = await db.query.aliases.findFirst({
    where: and(eq(aliases.id, aliasId), eq(aliases.ownerId, ownerId))
  });
  if (!alias) {
    throw new Error('Alias not found');
  }

  const rows = await db.select({
    id: deliveryFailureLog.id,
    aliasAddress: deliveryFailureLog.aliasAddress,
    recipient: deliveryFailureLog.recipient,
    provider: deliveryFailureLog.provider,
    providerMessageId: deliveryFailureLog.providerMessageId,
    reason: deliveryFailureLog.reason,
    failureDetail: deliveryFailureLog.failureDetail,
    timestamp: deliveryFailureLog.timestamp,
  })
    .from(deliveryFailureLog)
    .where(eq(deliveryFailureLog.aliasId, aliasId))
    .orderBy(desc(deliveryFailureLog.timestamp))
    .limit(l)
    .offset(o);
  return { failures: rows, limit: l, offset: o };
}

/**
 * Workspace-wide delivery failure summary for admins.
 * Groups by reason and returns counts — no body material.
 */
export async function getDeliveryFailureSummary() {
  const rows = await db.select({
    reason: deliveryFailureLog.reason,
    count: count(),
  })
    .from(deliveryFailureLog)
    .groupBy(deliveryFailureLog.reason);

  const summary = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.reason] = Number(r.count);
    return acc;
  }, { bounce: 0, complaint: 0, failed: 0 });

  const [total] = await db.select({ count: count() }).from(deliveryFailureLog);
  return { summary, total: Number(total?.count ?? 0) };
}

/**
 * List all delivery failures for admin (paginated, filterable by reason/alias).
 */
export async function listAllDeliveryFailures(query: {
  reason?: string;
  aliasId?: string;
  limit?: number;
  offset?: number;
}) {
  const l = Math.min(query.limit ?? 50, 100);
  const o = query.offset ?? 0;
  const filters = [];
  if (query.reason && ['bounce', 'complaint', 'failed'].includes(query.reason)) {
    filters.push(eq(deliveryFailureLog.reason, query.reason as 'bounce' | 'complaint' | 'failed'));
  }
  if (query.aliasId) {
    filters.push(eq(deliveryFailureLog.aliasId, query.aliasId));
  }
  const rows = await db.select({
    id: deliveryFailureLog.id,
    aliasId: deliveryFailureLog.aliasId,
    aliasAddress: deliveryFailureLog.aliasAddress,
    recipient: deliveryFailureLog.recipient,
    provider: deliveryFailureLog.provider,
    providerMessageId: deliveryFailureLog.providerMessageId,
    reason: deliveryFailureLog.reason,
    failureDetail: deliveryFailureLog.failureDetail,
    timestamp: deliveryFailureLog.timestamp,
  })
    .from(deliveryFailureLog)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(deliveryFailureLog.timestamp))
    .limit(l)
    .offset(o);
  return { failures: rows, limit: l, offset: o };
}

/**
 * Per-alias failure indicator: returns latest failure (if any) for each of the
 * user's aliases. Used to surface failure badges on alias cards.
 */
export async function getAliasFailureIndicators(ownerId: string) {
  // Get all alias IDs for this owner
  const userAliases = await db.select({ id: aliases.id, localPart: aliases.localPart }).from(aliases).where(eq(aliases.ownerId, ownerId));
  if (!userAliases.length) return [];

  const results = await Promise.all(userAliases.map(async (a) => {
    const [latest] = await db.select({
      reason: deliveryFailureLog.reason,
      timestamp: deliveryFailureLog.timestamp,
    })
      .from(deliveryFailureLog)
      .where(eq(deliveryFailureLog.aliasId, a.id))
      .orderBy(desc(deliveryFailureLog.timestamp))
      .limit(1);
    return {
      aliasId: a.id,
      localPart: a.localPart,
      hasFailure: !!latest,
      latestFailure: latest ?? null,
    };
  }));

  return results;
}

/**
 * List suppressed addresses (admin + user view).
 * Suppression prevents all future delivery to the address.
 */
export async function listSuppressedAddresses(opts: { limit?: number; offset?: number } = {}) {
  const l = Math.min(opts.limit ?? 50, 100);
  const o = opts.offset ?? 0;
  const rows = await db.select({
    id: suppressionList.id,
    email: suppressionList.email,
    reason: suppressionList.reason,
    createdAt: suppressionList.createdAt,
  })
    .from(suppressionList)
    .orderBy(desc(suppressionList.createdAt))
    .limit(l)
    .offset(o);
  return { suppressions: rows, limit: l, offset: o };
}
