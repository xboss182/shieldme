import net from 'node:net';
import { configureRelayKms, type KmsClient } from './crypto.js';

type KmsRequest = {
  op: 'encrypt' | 'decrypt';
  plaintext?: string;
  wrappedDek?: string;
  aad: string;
};

type KmsResponse = {
  ok: boolean;
  wrappedDek?: string;
  plaintext?: string;
  keyId?: string;
  error?: string;
};

function request(socketPath: string, input: KmsRequest): Promise<KmsResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let data = '';
    const timer = setTimeout(() => socket.destroy(new Error('kms_timeout')), 3_000);
    socket.setEncoding('utf8');
    socket.once('connect', () => socket.write(`${JSON.stringify(input)}\n`));
    socket.on('data', (chunk: string) => {
      data += chunk;
      if (data.length > 16_384) socket.destroy(new Error('kms_response_too_large'));
      const newline = data.indexOf('\n');
      if (newline === -1) return;
      try {
        resolve(JSON.parse(data.slice(0, newline)) as KmsResponse);
      } catch {
        reject(new Error('kms_invalid_response'));
      } finally {
        socket.end();
      }
    });
    socket.once('error', reject);
    socket.once('close', () => clearTimeout(timer));
  });
}

export function createLocalKmsClient(socketPath: string): KmsClient {
  if (!socketPath.startsWith('/')) throw new Error('kms_socket_path_must_be_absolute');
  return {
    async encrypt({ plaintext, aad }) {
      const response = await request(socketPath, { op: 'encrypt', plaintext, aad });
      if (!response.ok || !response.wrappedDek || !response.keyId) throw new Error(response.error ?? 'kms_encrypt_failed');
      return { wrappedDek: response.wrappedDek, keyId: response.keyId };
    },
    async decrypt({ wrappedDek, aad }) {
      const response = await request(socketPath, { op: 'decrypt', wrappedDek, aad });
      if (!response.ok || !response.plaintext) throw new Error(response.error ?? 'kms_decrypt_failed');
      return response.plaintext;
    },
  };
}

export function configureRelayKmsFromEnv(): void {
  const socketPath = process.env['RELAY_KMS_SOCKET_PATH'];
  configureRelayKms(socketPath ? createLocalKmsClient(socketPath) : undefined);
}
