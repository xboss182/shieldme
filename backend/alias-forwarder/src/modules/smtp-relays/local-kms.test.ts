import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalKmsClient } from './local-kms.js';

let directory: string | undefined;

afterEach(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

describe('local relay KMS client', () => {
  it('uses an absolute Unix socket and preserves AAD for wrap and unwrap requests', async () => {
    directory = mkdtempSync(join(tmpdir(), 'shieldme-kms-'));
    const socketPath = join(directory, 'kms.sock');
    const requests: Array<{ op: string; aad: string }> = [];
    const server = net.createServer((socket) => {
      socket.setEncoding('utf8');
      socket.once('data', (data: string) => {
        const request = JSON.parse(data) as { op: string; aad: string };
        requests.push(request);
        socket.end(`${JSON.stringify(request.op === 'encrypt'
          ? { ok: true, wrappedDek: 'wrapped', keyId: 'local-kek-v1' }
          : { ok: true, plaintext: 'ZGVr' })}\n`);
      });
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));

    const client = createLocalKmsClient(socketPath);
    await expect(client.encrypt({ plaintext: 'ZGVr', aad: 'record-aad' })).resolves.toEqual({ wrappedDek: 'wrapped', keyId: 'local-kek-v1' });
    await expect(client.decrypt({ wrappedDek: 'wrapped', aad: 'record-aad' })).resolves.toBe('ZGVr');
    expect(requests.map(({ op, aad }) => ({ op, aad }))).toEqual([{ op: 'encrypt', aad: 'record-aad' }, { op: 'decrypt', aad: 'record-aad' }]);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it('rejects a relative socket path', () => {
    expect(() => createLocalKmsClient('kms.sock')).toThrow('kms_socket_path_must_be_absolute');
  });
});
