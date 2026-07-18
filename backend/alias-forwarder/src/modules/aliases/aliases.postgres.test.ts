import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

const runPostgresRegression = process.env['RUN_POSTGRES_REGRESSION'] === '1';
const exec = promisify(execFile);

async function docker(...args: string[]) {
  return exec('docker', args);
}

const POSTGRES_READINESS_ATTEMPTS = 40;
const POSTGRES_READINESS_DELAY_MS = 250;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function truncateDiagnostic(value: string, maxLength = 2_000) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

async function postgresDiagnostics(containerName: string) {
  const [state, logs] = await Promise.all([
    docker('inspect', '--format', '{{.State.Status}} exit={{.State.ExitCode}} error={{.State.Error}}', containerName)
      .then(({ stdout }) => stdout.trim())
      .catch((error) => `inspect failed: ${errorMessage(error)}`),
    docker('logs', '--tail', '20', containerName)
      .then(({ stdout, stderr }) => `${stdout}${stderr}`.trim())
      .catch((error) => `logs failed: ${errorMessage(error)}`),
  ]);
  return `state=${truncateDiagnostic(state)} logs=${truncateDiagnostic(logs)}`;
}

async function waitForPublishedPostgres(databaseUrl: string, containerName: string) {
  let lastError = 'no connection attempt made';
  for (let attempt = 1; attempt <= POSTGRES_READINESS_ATTEMPTS; attempt += 1) {
    const probe = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 1_000 });
    try {
      await probe.query('SELECT 1');
      return;
    } catch (error) {
      lastError = errorMessage(error);
    } finally {
      await probe.end().catch(() => undefined);
    }
    await sleep(POSTGRES_READINESS_DELAY_MS);
  }

  throw new Error(
    `Timed out probing published PostgreSQL endpoint ${databaseUrl.replace(/:[^:@/]+@/, ':***@')} after ${POSTGRES_READINESS_ATTEMPTS} attempts; last error: ${lastError}; ${await postgresDiagnostics(containerName)}`,
  );
}

async function publishedPort(containerName: string) {
  const { stdout } = await docker(
    'inspect',
    '--format',
    '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
    containerName,
  );
  const port = stdout.trim();
  if (!/^\d+$/.test(port)) throw new Error(`Could not resolve PostgreSQL regression host port: ${port}`);
  return port;
}

async function readSql(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

describe.runIf(runPostgresRegression)('reserved alias PostgreSQL regression', () => {
  it('maps the real guard-only race through Drizzle to the stable 403 response', async () => {
    const containerName = `shieldme-reserved-${process.pid}-${randomUUID().slice(0, 8)}`;
    const runtimeConfigDirectory = await mkdtemp(join(tmpdir(), 'shieldme-reserved-regression-'));
    let regressionPool: Pool | undefined;
    let applicationPool: Pool | undefined;

    try {
      await docker(
        'run',
        '--detach',
        '--rm',
        '--name',
        containerName,
        '--env',
        'POSTGRES_USER=shieldme',
        '--env',
        'POSTGRES_PASSWORD=shieldme-test',
        '--env',
        'POSTGRES_DB=reserved_regression',
        '--publish',
        '127.0.0.1::5432',
        'postgres:16-alpine',
      );
      const port = await publishedPort(containerName);
      const databaseUrl = `postgres://shieldme:shieldme-test@127.0.0.1:${port}/reserved_regression`;
      await waitForPublishedPostgres(databaseUrl, containerName);
      regressionPool = new Pool({ connectionString: databaseUrl });

      await regressionPool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
      await regressionPool.query((await readSql('../../../drizzle/canonical-baseline/20260715175548_canonical_baseline.sql')).replaceAll('--> statement-breakpoint', ''));
      await regressionPool.query(await readSql('../../../drizzle/operational/20260718_dom_reserved_local_parts.sql'));

      const userId = randomUUID();
      const domainId = randomUUID();
      const recipientId = randomUUID();
      await regressionPool.query(
        'INSERT INTO "users" ("id", "email", "password_hash") VALUES ($1, $2, $3)',
        [userId, 'guard-race@example.test', 'not-used-by-regression'],
      );
      await regressionPool.query(
        `INSERT INTO "domains" (
          "id", "owner_id", "domain", "verification_token", "status", "dkim_selector", "dkim_public_key"
        ) VALUES ($1, $2, $3, $4, 'verified', $5, $6)`,
        [domainId, userId, 'guard-race-domain.test', 'guard-race-token', 'mail', 'guard-race-key'],
      );
      await regressionPool.query(
        `INSERT INTO "recipients" ("id", "owner_id", "email", "status")
         VALUES ($1, $2, $3, 'verified')`,
        [recipientId, userId, 'guard-race-recipient@example.test'],
      );
      await regressionPool.query(`
        CREATE FUNCTION "shieldme_test_reserve_guard_race"()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $guard_race$
        BEGIN
          IF NEW."local_part" = 'guard-race' THEN
            INSERT INTO "reserved_local_parts" ("local_part", "domain_id", "action", "note")
            VALUES ('guard-race', NULL, 'reserve', 'PostgreSQL regression')
            ON CONFLICT DO NOTHING;
          END IF;
          RETURN NEW;
        END
        $guard_race$;

        CREATE TRIGGER "aaa_shieldme_test_reserve_guard_race"
        BEFORE INSERT ON "aliases"
        FOR EACH ROW EXECUTE FUNCTION "shieldme_test_reserve_guard_race"();
      `);

      process.env['NODE_ENV'] = 'test';
      process.env['APP_URL'] = 'http://localhost:4001';
      process.env['DATABASE_URL'] = databaseUrl;
      process.env['REDIS_URL'] = 'redis://127.0.0.1:6379';
      process.env['JWT_ACCESS_SECRET'] = 'reserved-postgres-regression-access-secret';
      process.env['JWT_REFRESH_SECRET'] = 'reserved-postgres-regression-refresh-secret';
      process.env['RUNTIME_CONFIG_PATH'] = join(runtimeConfigDirectory, 'runtime-config.json');

      const [{ default: express }, { default: request }, { default: jwt }, aliasesRoutes, client] = await Promise.all([
        import('express'),
        import('supertest'),
        import('jsonwebtoken'),
        import('./aliases.routes.js'),
        import('../../db/client.js'),
      ]);
      applicationPool = client.pool;
      const app = express();
      app.use(express.json());
      app.use('/api/aliases', aliasesRoutes.aliasesRouter);
      app.use(aliasesRoutes.aliasErrorHandler);
      app.use((err: unknown, _req: unknown, res: { status: (status: number) => { json: (body: unknown) => void } }) => {
        res.status(500).json({ error: 'Internal server error' });
      });
      const token = jwt.sign(
        { sub: userId, email: 'guard-race@example.test', role: 'user', type: 'access' },
        process.env['JWT_ACCESS_SECRET'],
      );

      const response = await request(app)
        .post('/api/aliases')
        .set('Authorization', `Bearer ${token}`)
        .send({ localPart: 'guard-race', domainId, recipientId });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        code: 'RESERVED_ALIAS',
        error: 'Alias guard-race@guard-race-domain.test is reserved. Choose or generate a different alias name.',
      });
      await expect(regressionPool.query('SELECT 1 FROM "aliases" WHERE "local_part" = $1', ['guard-race']))
        .resolves.toMatchObject({ rowCount: 0 });
    } finally {
      await applicationPool?.end();
      await regressionPool?.end();
      await docker('rm', '--force', containerName).catch(() => undefined);
      await rm(runtimeConfigDirectory, { recursive: true, force: true });
    }
  }, 120_000);
});
