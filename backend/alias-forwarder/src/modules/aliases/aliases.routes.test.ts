import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DrizzleQueryError } from 'drizzle-orm/errors';

const {
  mockAliasFindFirst,
  mockReservedFindMany,
  mockInsert,
  mockAssertDomainVerified,
  mockAssertRecipientVerified,
} = vi.hoisted(() => ({
  mockAliasFindFirst: vi.fn(),
  mockReservedFindMany: vi.fn(),
  mockInsert: vi.fn(),
  mockAssertDomainVerified: vi.fn(),
  mockAssertRecipientVerified: vi.fn(),
}));

vi.mock('../../db/client.js', () => ({
  db: {
    query: {
      aliases: { findFirst: mockAliasFindFirst },
      reservedLocalParts: { findMany: mockReservedFindMany },
    },
    insert: mockInsert,
  },
}));

vi.mock('../../middleware/authenticate.js', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.auth = { userId: 'owner-1', email: 'owner@example.com' };
    next();
  },
}));

vi.mock('../plans/plans.js', () => ({
  assertCanCreateAlias: vi.fn().mockResolvedValue(undefined),
  assertOutboundProviderAllowed: vi.fn().mockResolvedValue(undefined),
  assertPgpAllowed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../domains/domains.service.js', () => ({
  assertDomainVerified: (...args: unknown[]) => mockAssertDomainVerified(...args),
}));

vi.mock('../recipients/recipients.service.js', () => ({
  assertRecipientVerified: (...args: unknown[]) => mockAssertRecipientVerified(...args),
}));

import { aliasesRouter, aliasErrorHandler } from './aliases.routes.js';

const DOMAIN_ID = 'a0000000-0000-0000-0000-000000000001';
const RECIPIENT_ID = 'b0000000-0000-0000-0000-000000000002';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/aliases', aliasesRouter);
  app.use(aliasErrorHandler);
  return app;
}

function insertRejects(error: unknown) {
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({ returning: vi.fn().mockRejectedValue(error) }),
  });
}

function postgresError(message: string, code: string, constraint?: string) {
  return Object.assign(new Error(message), { code, constraint });
}

function drizzleQueryError(cause: Error) {
  return new DrizzleQueryError('insert into "aliases"', [], cause);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAliasFindFirst.mockResolvedValue(null);
  mockReservedFindMany.mockResolvedValue([]);
  mockAssertDomainVerified.mockResolvedValue({ id: DOMAIN_ID, domain: 'example.com' });
  mockAssertRecipientVerified.mockResolvedValue({ id: RECIPIENT_ID, email: 'inbox@example.net' });
});

describe('POST /api/aliases reserved enforcement', () => {
  it.each([
    ['dashboard', { localPart: '9Router', domainId: DOMAIN_ID, recipientId: RECIPIENT_ID, pgpMode: 'none' }],
    ['extension', { localPart: '9router', domainId: DOMAIN_ID, recipientId: RECIPIENT_ID }],
  ])('returns the stable 403 response for a %s create request', async (_client, payload) => {
    mockReservedFindMany.mockResolvedValue([
      { localPart: '9router', domainId: null, action: 'reserve' },
    ]);

    const response = await request(buildApp()).post('/api/aliases').send(payload);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: 'RESERVED_ALIAS',
      error: 'Alias 9router@example.com is reserved. Choose or generate a different alias name.',
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('maps a Drizzle-wrapped PostgreSQL guard rejection to the required API response', async () => {
    insertRejects(drizzleQueryError(postgresError(
      'new row violates check constraint',
      '23514',
      'aliases_reserved_local_part_guard',
    )));

    const response = await request(buildApp()).post('/api/aliases').send({
      localPart: '9router',
      domainId: DOMAIN_ID,
      recipientId: RECIPIENT_ID,
    });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: 'RESERVED_ALIAS',
      error: 'Alias 9router@example.com is reserved. Choose or generate a different alias name.',
    });
  });

  it('keeps Drizzle-wrapped uniqueness conflicts distinct from reserved rejections', async () => {
    insertRejects(drizzleQueryError(postgresError('duplicate key value violates unique constraint', '23505')));

    const response = await request(buildApp()).post('/api/aliases').send({
      localPart: 'available',
      domainId: DOMAIN_ID,
      recipientId: RECIPIENT_ID,
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'Alias available@example.com already exists' });
  });

  it('preserves unrelated Drizzle errors as server failures', async () => {
    insertRejects(drizzleQueryError(postgresError('connection lost', '08006')));

    const response = await request(buildApp()).post('/api/aliases').send({
      localPart: 'available',
      domainId: DOMAIN_ID,
      recipientId: RECIPIENT_ID,
    });

    expect(response.status).toBe(500);
  });
});
