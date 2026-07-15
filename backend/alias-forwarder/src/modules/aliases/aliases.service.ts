import { and, eq, ne, sql, count, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { aliases, domains, mailLogs, reservedLocalParts } from '../../db/schema.js';
import type { PgpKeyInfo } from '../pgp/pgp.service.js';
import { assertDomainVerified } from '../domains/domains.service.js';
import { assertRecipientVerified } from '../recipients/recipients.service.js';
import type { CreateAliasInput, UpdateAliasInput } from './aliases.schemas.js';
import { resolveReservedLocalPart } from './reserved-local-parts.js';
import { assertCanCreateAlias, assertOutboundProviderAllowed, assertPgpAllowed } from '../plans/plans.js';

export class AliasError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

export type AliasProtectionStatus = 'protected' | 'unprotected' | 'required_missing_key';

export interface AliasProtection {
  status: AliasProtectionStatus;
  pgpMode: 'none' | 'optional' | 'required';
  encryptedForwarding: boolean;
  plaintextForwardingPossible: boolean;
  key: {
    available: boolean;
    fingerprint?: string;
    algorithm?: string;
    expiresAt?: Date | null;
    expiresSoon?: boolean;
    rotationGuidance?: string;
  };
}

export function getAliasProtection<T extends { pgpMode: 'none' | 'optional' | 'required'; recipient?: { pgpKey?: PgpKeyInfo | null } | null }>(
  alias: T,
): AliasProtection {
  const key = alias.recipient?.pgpKey ?? null;
  const keyAvailable = Boolean(key);
  const expiresSoon = Boolean(key?.expiresSoon ?? (key?.expiresAt && key.expiresAt.getTime() - Date.now() <= 30 * 24 * 60 * 60 * 1000));

  if (alias.pgpMode === 'required' && !keyAvailable) {
    return {
      status: 'required_missing_key',
      pgpMode: alias.pgpMode,
      encryptedForwarding: false,
      plaintextForwardingPossible: false,
      key: { available: false },
    };
  }

  const protectedForwarding = alias.pgpMode !== 'none' && keyAvailable;
  return {
    status: protectedForwarding ? 'protected' : 'unprotected',
    pgpMode: alias.pgpMode,
    encryptedForwarding: protectedForwarding,
    plaintextForwardingPossible: !protectedForwarding,
    key: key
      ? {
          available: true,
          fingerprint: key.fingerprint,
          algorithm: key.algorithm,
          expiresAt: key.expiresAt,
          expiresSoon,
          rotationGuidance: expiresSoon
            ? 'This PGP key expires within 30 days. Upload a replacement public key before expiry to avoid required-mode delivery rejections.'
            : 'Rotate PGP keys by uploading the replacement public key, sending a test encrypted delivery, then retiring the old private key.',
        }
      : { available: false },
  };
}

function withAliasProtection<T extends { pgpMode: 'none' | 'optional' | 'required'; recipient?: { pgpKey?: PgpKeyInfo | null } | null }>(
  alias: T,
): T & { protection: AliasProtection; protectionStatus: AliasProtectionStatus } {
  const protection = getAliasProtection(alias);
  return { ...alias, protection, protectionStatus: protection.status };
}

export async function createAlias(ownerId: string, input: CreateAliasInput) {
  await assertCanCreateAlias(ownerId);
  await assertOutboundProviderAllowed(ownerId);
  if (input.pgpMode && input.pgpMode !== 'none') await assertPgpAllowed(ownerId);

  const domain = await assertDomainVerified(ownerId, input.domainId);
  const recipient = await assertRecipientVerified(ownerId, input.recipientId);

  const reservedRules = await db.query.reservedLocalParts.findMany({
    where: sql`${reservedLocalParts.localPart} = ${input.localPart} and (${reservedLocalParts.domainId} is null or ${reservedLocalParts.domainId} = ${input.domainId})`,
    columns: { localPart: true, domainId: true, action: true },
  });
  const reservation = resolveReservedLocalPart(input.localPart, reservedRules, input.domainId);
  if (reservation.reserved) {
    throw new AliasError(`Alias ${input.localPart}@${domain.domain} is reserved for domain operations and security`, 403);
  }

  const conflict = await db.query.aliases.findFirst({
    where: and(
      eq(aliases.localPart, input.localPart),
      eq(aliases.domainId, input.domainId),
    ),
  });
  if (conflict) {
    const suffix = conflict.status === 'deleted' ? ' was used before and is reserved' : ' already exists';
    throw new AliasError(`Alias ${input.localPart}@${domain.domain}${suffix}`, 409);
  }

  let alias;
  try {
    [alias] = await db
      .insert(aliases)
      .values({
        ownerId,
        domainId: input.domainId,
        recipientId: input.recipientId,
        localPart: input.localPart,
        pgpMode: input.pgpMode ?? 'none',
      })
      .returning();
  } catch (err) {
    if (typeof err === 'object' && err && 'code' in err && (err as { code?: string }).code === '23505') {
      throw new AliasError(`Alias ${input.localPart}@${domain.domain} already exists`, 409);
    }
    throw err;
  }

  return {
    alias,
    address: `${alias.localPart}@${domain.domain}`,
    recipientEmail: recipient.email,
  };
}

export async function updateAlias(ownerId: string, aliasId: string, input: UpdateAliasInput) {
  const row = await db.query.aliases.findFirst({
    where: and(eq(aliases.id, aliasId), eq(aliases.ownerId, ownerId), ne(aliases.status, 'deleted')),
  });
  if (!row) throw new AliasError('Alias not found', 404);

  if (input.pgpMode && input.pgpMode !== 'none') await assertPgpAllowed(ownerId);

  const [updated] = await db
    .update(aliases)
    .set({ pgpMode: input.pgpMode, updatedAt: new Date() })
    .where(eq(aliases.id, aliasId))
    .returning();
  return updated;
}

export async function listAliases(ownerId: string) {
  const rows = await db.query.aliases.findMany({
    where: and(eq(aliases.ownerId, ownerId), ne(aliases.status, 'deleted')),
    with: {
      domain: { columns: { domain: true } },
      recipient: {
        columns: { email: true },
        with: {
          pgpKey: {
            columns: {
              id: true,
              recipientId: true,
              fingerprint: true,
              algorithm: true,
              expiresAt: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      },
    },
    columns: {
      id: true,
      localPart: true,
      domainId: true,
      recipientId: true,
      status: true,
      pgpMode: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return rows.map(alias => withAliasProtection(alias));
}

export async function getAlias(ownerId: string, aliasId: string) {
  const row = await db.query.aliases.findFirst({
    where: and(eq(aliases.id, aliasId), eq(aliases.ownerId, ownerId), ne(aliases.status, 'deleted')),
    with: {
      domain: { columns: { domain: true } },
      recipient: {
        columns: { email: true },
        with: {
          pgpKey: {
            columns: {
              id: true,
              recipientId: true,
              fingerprint: true,
              algorithm: true,
              expiresAt: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      },
    },
  });
  if (!row) throw new AliasError('Alias not found', 404);
  return withAliasProtection(row);
}

export async function enableAlias(ownerId: string, aliasId: string) {
  const row = await db.query.aliases.findFirst({
    where: and(eq(aliases.id, aliasId), eq(aliases.ownerId, ownerId)),
  });
  if (!row) throw new AliasError('Alias not found', 404);
  if (row.status === 'deleted') throw new AliasError('Alias has been deleted', 410);
  if (row.status === 'active') throw new AliasError('Alias is already active', 409);

  const [updated] = await db
    .update(aliases)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(aliases.id, aliasId))
    .returning();
  return updated;
}

export async function disableAlias(ownerId: string, aliasId: string) {
  const row = await db.query.aliases.findFirst({
    where: and(eq(aliases.id, aliasId), eq(aliases.ownerId, ownerId)),
  });
  if (!row) throw new AliasError('Alias not found', 404);
  if (row.status === 'deleted') throw new AliasError('Alias has been deleted', 410);
  if (row.status === 'disabled') throw new AliasError('Alias is already disabled', 409);

  const [updated] = await db
    .update(aliases)
    .set({ status: 'disabled', updatedAt: new Date() })
    .where(eq(aliases.id, aliasId))
    .returning();
  return updated;
}

export async function deleteAlias(ownerId: string, aliasId: string) {
  const row = await db.query.aliases.findFirst({
    where: and(eq(aliases.id, aliasId), eq(aliases.ownerId, ownerId)),
  });
  if (!row) throw new AliasError('Alias not found', 404);
  if (row.status === 'deleted') throw new AliasError('Alias already deleted', 410);

  await db
    .update(aliases)
    .set({ status: 'deleted', updatedAt: new Date() })
    .where(eq(aliases.id, aliasId));
}

export async function getAliasStats(ownerId: string) {
  const userAliases = await db.query.aliases.findMany({
    where: and(eq(aliases.ownerId, ownerId), ne(aliases.status, 'deleted')),
    columns: { id: true },
  });

  const aliasIds = userAliases.map(a => a.id);
  if (aliasIds.length === 0) {
    return {
      totalForwarded: 0,
      totalBlocked: 0,
      totalFailed: 0,
      totalSpamTagged: 0,
      totalSpamRejected: 0,
      totalSpamQuarantined: 0,
      totalSpamDetected: 0,
      perAlias: {},
    };
  }

  const rows = await db
    .select({
      aliasId: mailLogs.aliasId,
      status: mailLogs.status,
      spamAction: mailLogs.spamAction,
      cnt: count(),
    })
    .from(mailLogs)
    .where(inArray(mailLogs.aliasId, aliasIds))
    .groupBy(mailLogs.aliasId, mailLogs.status, mailLogs.spamAction);

  let totalForwarded = 0;
  let totalBlocked = 0;
  let totalFailed = 0;
  let totalSpamTagged = 0;
  let totalSpamRejected = 0;
  let totalSpamQuarantined = 0;
  const perAlias: Record<string, { forwarded: number; blocked: number; failed: number; spamTagged: number; spamRejected: number; spamQuarantined: number }> = {};

  for (const row of rows) {
    const aid = row.aliasId ?? '__unknown__';
    if (!perAlias[aid]) perAlias[aid] = { forwarded: 0, blocked: 0, failed: 0, spamTagged: 0, spamRejected: 0, spamQuarantined: 0 };
    const cnt = Number(row.cnt);
    if (row.status === 'delivered') { perAlias[aid].forwarded += cnt; totalForwarded += cnt; }
    else if (row.status === 'rejected') { perAlias[aid].blocked += cnt; totalBlocked += cnt; }
    else if (row.status === 'failed') { perAlias[aid].failed += cnt; totalFailed += cnt; }

    if (row.spamAction === 'tag') { perAlias[aid].spamTagged += cnt; totalSpamTagged += cnt; }
    else if (row.spamAction === 'reject') { perAlias[aid].spamRejected += cnt; totalSpamRejected += cnt; }
    else if (row.spamAction === 'quarantine') { perAlias[aid].spamQuarantined += cnt; totalSpamQuarantined += cnt; }
  }

  return {
    totalForwarded,
    totalBlocked,
    totalFailed,
    totalSpamTagged,
    totalSpamRejected,
    totalSpamQuarantined,
    totalSpamDetected: totalSpamTagged + totalSpamRejected + totalSpamQuarantined,
    perAlias,
  };
}

export async function listFailedDeliveries(ownerId: string, query: { status?: string; page?: unknown; limit?: unknown }) {
  const p = Number.isFinite(Number(query.page)) && Number(query.page) > 0 ? Math.floor(Number(query.page)) : 1;
  const l = Number.isFinite(Number(query.limit)) && Number(query.limit) > 0 ? Math.min(Math.floor(Number(query.limit)), 100) : 50;
  const statusFilter = query.status && ['failed', 'bounced', 'complained', 'rejected'].includes(String(query.status)) ? String(query.status) : undefined;

  const userAliases = await db.query.aliases.findMany({
    where: and(eq(aliases.ownerId, ownerId), ne(aliases.status, 'deleted')),
    columns: { id: true },
  });
  const aliasIds = userAliases.map(a => a.id);
  if (!aliasIds.length) return { deliveries: [], page: p, limit: l };

  const filters = [inArray(mailLogs.aliasId, aliasIds)];
  if (statusFilter) filters.push(eq(mailLogs.status, statusFilter as any));
  else filters.push(inArray(mailLogs.status, ['failed', 'bounced', 'complained', 'rejected'] as any));

  const rows = await db.select({
    id: mailLogs.id,
    aliasId: mailLogs.aliasId,
    aliasLocalPart: aliases.localPart,
    aliasDomain: domains.domain,
    envelopeFrom: mailLogs.envelopeFrom,
    envelopeTo: mailLogs.envelopeTo,
    forwardedTo: mailLogs.forwardedTo,
    status: mailLogs.status,
    failureType: mailLogs.failureType,
    failureReason: mailLogs.failureReason,
    rejectionReason: mailLogs.rejectionReason,
    outboundProvider: mailLogs.outboundProvider,
    createdAt: mailLogs.createdAt,
    updatedAt: mailLogs.updatedAt,
  })
    .from(mailLogs)
    .leftJoin(aliases, eq(aliases.id, mailLogs.aliasId))
    .leftJoin(domains, eq(domains.id, aliases.domainId))
    .where(and(...filters))
    .orderBy(sql`${mailLogs.createdAt} desc`)
    .limit(l)
    .offset((p - 1) * l);

  return { deliveries: rows, page: p, limit: l };
}
