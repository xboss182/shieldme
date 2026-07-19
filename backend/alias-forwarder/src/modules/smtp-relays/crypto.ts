import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type KmsClient = {
  encrypt(input: { plaintext: string; aad: string }): Promise<{ wrappedDek: string; keyId: string }>;
  decrypt(input: { wrappedDek: string; aad: string }): Promise<string>;
};

let client: KmsClient | undefined;

export function configureRelayKms(next: KmsClient | undefined) {
  client = next;
}

export function isRelayKmsConfigured() {
  return Boolean(client);
}

function requiredClient(): KmsClient {
  if (!client) throw new RelayCryptoError('kms_unavailable', 503);
  return client;
}

export class RelayCryptoError extends Error {
  constructor(public code: string, public statusCode = 400) {
    super(code);
  }
}

function aad(kind: string, ownerId: string, recordId: string, version: number) {
  return `shieldme:v1:${kind}:${ownerId}:${recordId}:${version}`;
}

export type SecretEnvelope = {
  ciphertext: string;
  iv: string;
  tag: string;
  wrappedDek: string;
  kekKeyId: string;
  envelopeVersion: number;
};

export async function encryptRelaySecret(kind: string, ownerId: string, recordId: string, version: number, value: unknown): Promise<SecretEnvelope> {
  const context = aad(kind, ownerId, recordId, version);
  const dek = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dek, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  try {
    const wrapped = await requiredClient().encrypt({ plaintext: dek.toString('base64'), aad: context });
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      wrappedDek: wrapped.wrappedDek,
      kekKeyId: wrapped.keyId,
      envelopeVersion: 1,
    };
  } finally {
    dek.fill(0);
  }
}

export async function decryptRelaySecret<T>(kind: string, ownerId: string, recordId: string, version: number, envelope: SecretEnvelope): Promise<T> {
  const context = aad(kind, ownerId, recordId, version);
  let dek: Buffer | undefined;
  try {
    dek = Buffer.from(await requiredClient().decrypt({ wrappedDek: envelope.wrappedDek, aad: context }), 'base64');
    if (dek.length !== 32) throw new RelayCryptoError('invalid_kms_dek');
    const decipher = createDecipheriv('aes-256-gcm', dek, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8')) as T;
  } catch (error) {
    if (error instanceof RelayCryptoError) throw error;
    throw new RelayCryptoError('secret_decrypt_failed', 503);
  } finally {
    dek?.fill(0);
  }
}
