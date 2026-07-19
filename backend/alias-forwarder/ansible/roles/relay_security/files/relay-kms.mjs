import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, chmodSync } from 'node:fs';
import net from 'node:net';

const socketPath = process.env.RELAY_KMS_SOCKET_PATH ?? '/run/shieldme-relay-kms/kms.sock';
const keyDirectory = process.env.RELAY_KMS_KEY_DIR ?? '/var/lib/shieldme-relay-kms';
const activeKeyId = process.env.RELAY_KMS_ACTIVE_KEY_ID ?? 'v1';

if (!/^v[1-9][0-9]*$/.test(activeKeyId)) throw new Error('invalid_active_kek_id');

function keyPath(keyId) {
  if (!/^v[1-9][0-9]*$/.test(keyId)) throw new Error('invalid_kek_id');
  return `${keyDirectory}/${keyId}.key`;
}

function key(keyId) {
  const value = Buffer.from(readFileSync(keyPath(keyId), 'utf8').trim(), 'base64');
  if (value.length !== 32) throw new Error('invalid_kek');
  return value;
}

function wrap(plaintext, aad) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(activeKeyId), iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext, 'base64')), cipher.final()]);
  return { wrappedDek: [activeKeyId, iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.'), keyId: `local-kek-${activeKeyId}` };
}

function unwrap(wrappedDek, aad) {
  const [keyId, iv, tag, ciphertext, extra] = String(wrappedDek).split('.');
  if (extra || !keyId || !iv || !tag || !ciphertext) throw new Error('invalid_wrapped_dek');
  const decipher = createDecipheriv('aes-256-gcm', key(keyId), Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('base64');
}

function respond(socket, value) {
  socket.end(`${JSON.stringify(value)}\n`);
}

if (existsSync(socketPath)) unlinkSync(socketPath);
const server = net.createServer((socket) => {
  socket.setEncoding('utf8');
  let data = '';
  socket.on('data', (chunk) => {
    data += chunk;
    if (data.length > 16_384) return socket.destroy();
    const newline = data.indexOf('\n');
    if (newline === -1) return;
    try {
      const request = JSON.parse(data.slice(0, newline));
      if (request.op === 'encrypt' && typeof request.plaintext === 'string' && typeof request.aad === 'string') return respond(socket, { ok: true, ...wrap(request.plaintext, request.aad) });
      if (request.op === 'decrypt' && typeof request.wrappedDek === 'string' && typeof request.aad === 'string') return respond(socket, { ok: true, plaintext: unwrap(request.wrappedDek, request.aad) });
      respond(socket, { ok: false, error: 'invalid_request' });
    } catch {
      respond(socket, { ok: false, error: 'kms_operation_failed' });
    }
  });
});

server.listen(socketPath, () => chmodSync(socketPath, 0o660));

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
