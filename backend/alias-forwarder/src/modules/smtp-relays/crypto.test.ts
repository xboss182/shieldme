import { afterEach, describe, expect, it } from 'vitest';
import { configureRelayKms, decryptRelaySecret, encryptRelaySecret } from './crypto.js';

describe('relay credential envelope', () => {
  afterEach(() => configureRelayKms(undefined));

  it('binds ciphertext to owner, record, kind, and version through AAD', async () => {
    const keys = new Map<string, { plaintext: string; aad: string }>();
    configureRelayKms({
      encrypt: async ({ plaintext, aad }) => {
        const wrappedDek = `wrapped-${keys.size}`;
        keys.set(wrappedDek, { plaintext, aad });
        return { wrappedDek, keyId: 'test-kek' };
      },
      decrypt: async ({ wrappedDek, aad }) => {
        const key = keys.get(wrappedDek);
        if (!key || key.aad !== aad) throw new Error('aad mismatch');
        return key.plaintext;
      },
    });

    const envelope = await encryptRelaySecret('smtp_credentials', 'owner-a', 'relay-a', 1, { username: 'user', password: 'secret' });
    await expect(decryptRelaySecret('smtp_credentials', 'owner-a', 'relay-a', 1, envelope)).resolves.toEqual({ username: 'user', password: 'secret' });
    await expect(decryptRelaySecret('smtp_credentials', 'owner-b', 'relay-a', 1, envelope)).rejects.toMatchObject({ code: 'secret_decrypt_failed' });
  });
});
