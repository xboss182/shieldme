import { createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  aliasVerifyCapabilities,
  aliases,
  transparencyEventLinks,
  transparencyEvents,
  transparencyHeads,
  transparencyMmrNodes,
} from '../../db/schema.js';

const { mockDb, privateSeed } = vi.hoisted(() => ({
  mockDb: {} as Record<string, unknown>,
  privateSeed: Buffer.alloc(32, 7).toString('base64url'),
}));

vi.mock('../../config/env.js', () => ({
  env: {
    TRANSPARENCY_SIGNING_PRIVATE_KEY: privateSeed,
    TRANSPARENCY_SIGNING_KEY_ID: 'test-v1',
    TRANSPARENCY_VERIFY_CODE_PEPPER: 'a'.repeat(64),
    VERIFY_ENABLED: true,
  },
}));

vi.mock('../../db/client.js', () => ({ db: mockDb }));

import {
  appendTransparencyEvent,
  backfillTransparencyLog,
  generateVerifyCode,
  getSigningPublicKeyInfo,
  signTransparencyHead,
} from './verify.service.js';

const verifyMigration = readFileSync(
  join(process.cwd(), 'drizzle/operational/20260722_verify_transparency.sql'),
  'utf8',
);

function configureBackfillDb() {
  const eventRows: Array<{ id: string; sequence: number }> = [];
  const capabilities = new Set<string>();
  const insertedEvents: Array<Record<string, unknown>> = [];
  const insertedHeads: Array<Record<string, unknown>> = [];
  const mmrNodes: Array<{ startSequence: number; size: number; hash: string }> = [];
  const aliasRows = [{
    id: 'c0000000-0000-0000-0000-000000000003',
    status: 'active',
    createdAt: new Date('2026-07-22T00:00:00.000Z'),
  }];

  const transaction = async (callback: (tx: Record<string, unknown>) => Promise<unknown>) => {
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({
        from(table: unknown) {
          if (table === aliases) return { orderBy: vi.fn().mockResolvedValue(aliasRows) };
          if (table === aliasVerifyCapabilities) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn().mockImplementation(async () => capabilities.size ? [{ aliasId: aliasRows[0]!.id }] : []),
              })),
            };
          }
          if (table === transparencyEvents) {
            return {
              where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
              orderBy: vi.fn(() => ({ limit: vi.fn().mockImplementation(async () => eventRows.length ? [eventRows.at(-1)] : []) })),
            };
          }
          if (table === transparencyMmrNodes) return Promise.resolve(mmrNodes);
          if (table === transparencyHeads) {
            return { orderBy: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) };
          }
          if (table === transparencyEventLinks) return Promise.resolve([]);
          throw new Error('Unexpected select table');
        },
      })),
      insert: vi.fn((table: unknown) => ({
        values(values: Record<string, unknown> | Array<Record<string, unknown>>) {
          if (table === aliasVerifyCapabilities) {
            return {
              onConflictDoNothing: () => ({
                returning: async () => {
                  capabilities.add((values as Record<string, string>).aliasId);
                  return [{ aliasId: (values as Record<string, string>).aliasId }];
                },
              }),
            };
          }
          if (table === transparencyEvents) {
            const event = values as Record<string, unknown>;
            insertedEvents.push(event);
            eventRows.push({ id: event.id as string, sequence: event.sequence as number });
          }
          if (table === transparencyMmrNodes) mmrNodes.push(...values as Array<{ startSequence: number; size: number; hash: string }>);
          if (table === transparencyHeads) insertedHeads.push(values as Record<string, unknown>);
          return { onConflictDoNothing: () => ({ returning: async () => [] }) };
        },
      })),
    };
    return callback(tx);
  };

  Object.assign(mockDb, { transaction });
  return { capabilities, insertedEvents, insertedHeads };
}

describe('transparency signing', () => {
  it('uses Node Ed25519 null-digest signing with a raw seed', () => {
    const payload = Buffer.from('signed transparency head');
    const signature = signTransparencyHead(payload);
    const key = getSigningPublicKeyInfo();
    expect(key).not.toBeNull();

    const publicKey = createPublicKey({
      key: Buffer.concat([
        Buffer.from('302a300506032b6570032100', 'hex'),
        Buffer.from(key!.publicKey, 'base64url'),
      ]),
      format: 'der',
      type: 'spki',
    });

    expect(verify(null, payload, publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
  });

  it('derives stable, alias-scoped verification capabilities', () => {
    const aliasId = 'c0000000-0000-0000-0000-000000000003';
    expect(generateVerifyCode(aliasId)).toBe(generateVerifyCode(aliasId));
    expect(generateVerifyCode(aliasId)).not.toBe(generateVerifyCode('c0000000-0000-0000-0000-000000000004'));
  });
});

describe('transparency payload validation', () => {
  it('rejects unallowlisted payload fields before writing', async () => {
    configureBackfillDb();
    await expect(appendTransparencyEvent({
      eventType: 'alias.created',
      occurredAt: new Date(),
      publicPayload: { status: 'active', alias: 'secret@example.com' },
    })).rejects.toThrow('Transparency payload is not permitted');
  });
});

describe('transparency backfill', () => {
  it('creates a capability, append-only snapshots, and signed heads in one transaction', async () => {
    const state = configureBackfillDb();

    await expect(backfillTransparencyLog()).resolves.toEqual({ aliasesProcessed: 1, capabilitiesCreated: 1 });
    expect(state.capabilities.size).toBe(1);
    expect(state.insertedEvents).toHaveLength(2);
    expect(state.insertedHeads).toHaveLength(2);
    expect(state.insertedEvents[0]!.publicPayload).toEqual({ snapshot: true, status: 'active' });
    expect(state.insertedEvents[0]!.idempotencyKey).toBe('verify-backfill:v1:alias:c0000000-0000-0000-0000-000000000003');
  });
});

describe('verify transparency migration', () => {
  it('is additive, transactional, and has every required relation', () => {
    expect(verifyMigration).toContain('BEGIN;');
    expect(verifyMigration).toContain('pg_advisory_xact_lock');
    for (const table of [
      'transparency_events',
      'transparency_heads',
      'transparency_mmr_nodes',
      'alias_verify_capabilities',
      'alias_daily_forward_counts',
      'provider_transparency_profiles',
    ]) {
      expect(verifyMigration).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
    }
    expect(verifyMigration).toContain('ALTER TABLE "domain_signing_keys" ADD COLUMN IF NOT EXISTS "public_key_sha256"');
    expect(verifyMigration).not.toMatch(/DROP (TABLE|TYPE|CONSTRAINT)/);
    expect(verifyMigration).not.toMatch(/CREATE TABLE IF NOT EXISTS "(users|domains|aliases|mail_logs|audit_logs)"/);
  });
});
