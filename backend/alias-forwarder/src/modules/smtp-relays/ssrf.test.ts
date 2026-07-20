import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolve4, resolve6 } = vi.hoisted(() => ({ resolve4: vi.fn(), resolve6: vi.fn() }));
vi.mock('node:dns/promises', () => ({ resolve4, resolve6 }));

import { isPublicRelayAddress, normalizeRelayHost, resolvePublicRelayHost } from './ssrf.js';

beforeEach(() => {
  resolve4.mockResolvedValue(['8.8.8.8']);
  resolve6.mockResolvedValue([]);
});

describe('relay endpoint validation', () => {
  it.each([
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254',
    '172.16.0.1', '192.0.0.1', '192.0.2.1', '192.168.1.1', '198.18.0.1',
    '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255', '::1',
    'fc00::1', 'fe80::1', 'ff00::1', '2001:db8::1', '::ffff:127.0.0.1',
  ])('rejects unsafe relay address %s', (address) => {
    expect(isPublicRelayAddress(address)).toBe(false);
  });

  it('allows public IPv4 and IPv6 addresses', () => {
    expect(isPublicRelayAddress('8.8.8.8')).toBe(true);
    expect(isPublicRelayAddress('2606:4700:4700::1111')).toBe(true);
  });

  it('requires a canonical FQDN and rejects IP literals and trailing-dot forms', () => {
    expect(normalizeRelayHost('SMTP.Example.COM')).toBe('smtp.example.com');
    for (const host of ['localhost', '127.0.0.1', '::1', 'smtp.example.com.', 'singlelabel', 'bad_host.example']) {
      expect(() => normalizeRelayHost(host)).toThrow('invalid_relay_host');
    }
  });

  it('fails closed when any address returned during resolution is unsafe', async () => {
    resolve4.mockResolvedValue(['8.8.8.8', '127.0.0.1']);
    await expect(resolvePublicRelayHost('smtp.example.com')).rejects.toThrow('unsafe_relay_address');
  });
});
