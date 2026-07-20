import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';
import { resolve4, resolve6 } from 'node:dns/promises';

export class RelayEndpointError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const DNS_TIMEOUT_MS = 3_000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new RelayEndpointError('dns_timeout')), DNS_TIMEOUT_MS)),
  ]);
}

function ipv4Number(address: string): number {
  return address.split('.').reduce((value, part) => (value << 8) + Number(part), 0) >>> 0;
}

function inIpv4Range(address: string, network: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4Number(address) & mask) === (ipv4Number(network) & mask);
}

function parseIpv6(address: string): number[] | null {
  const value = address.toLowerCase();
  if (value.includes('.')) return null;
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if (left.concat(right).some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  return [...left.map((part) => parseInt(part, 16)), ...Array(missing).fill(0), ...right.map((part) => parseInt(part, 16))];
}

function ipv6Starts(address: number[], prefix: number[]): boolean {
  return prefix.every((part, index) => address[index] === part);
}

export function isPublicRelayAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) {
    return ![
      ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
      ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
      ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
      ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
    ].some(([network, prefix]) => inIpv4Range(address, String(network), Number(prefix)));
  }
  if (kind !== 6) return false;
  const parts = parseIpv6(address);
  if (!parts) return false;
  if (parts.slice(0, 6).every((part) => part === 0) || (parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff)) {
    return isPublicRelayAddress(`${parts[6] >>> 8}.${parts[6] & 0xff}.${parts[7] >>> 8}.${parts[7] & 0xff}`);
  }
  return !(
    ipv6Starts(parts, [0, 0, 0, 0, 0, 0, 0, 0]) ||
    ipv6Starts(parts, [0, 0, 0, 0, 0, 0, 0, 1]) ||
    (parts[0] & 0xfe00) === 0xfc00 ||
    (parts[0] & 0xffc0) === 0xfe80 ||
    (parts[0] & 0xff00) === 0xff00 ||
    ipv6Starts(parts, [0x2001, 0x0db8]) ||
    ipv6Starts(parts, [0x64, 0xff9b, 0, 0, 0, 0]) ||
    ipv6Starts(parts, [0x64, 0xff9b, 1]) ||
    ipv6Starts(parts, [0x100]) ||
    (parts[0] === 0x2001 && (parts[1] & 0xfe00) === 0) ||
    ipv6Starts(parts, [0x2002]) ||
    (parts[0] === 0x3fff && (parts[1] & 0xfff0) === 0) ||
    ipv6Starts(parts, [0x5f00])
  );
}

export function normalizeRelayHost(value: string): string {
  const raw = value.trim();
  if (!raw || raw.endsWith('.') || raw.length > 253 || isIP(raw)) throw new RelayEndpointError('invalid_relay_host');
  const host = domainToASCII(raw);
  if (!host || host.length > 253 || host.toLowerCase() === 'localhost') throw new RelayEndpointError('invalid_relay_host');
  const labels = host.split('.');
  if (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) {
    throw new RelayEndpointError('invalid_relay_host');
  }
  return host.toLowerCase();
}

export async function resolvePublicRelayHost(value: string): Promise<{ host: string; addresses: string[] }> {
  const host = normalizeRelayHost(value);
  let addresses: string[];
  try {
    const [v4, v6] = await Promise.all([
      withTimeout(resolve4(host)).catch((error) => error instanceof RelayEndpointError ? Promise.reject(error) : []),
      withTimeout(resolve6(host)).catch((error) => error instanceof RelayEndpointError ? Promise.reject(error) : []),
    ]);
    addresses = [...v4, ...v6];
  } catch (error) {
    if (error instanceof RelayEndpointError) throw error;
    throw new RelayEndpointError('dns_lookup_failed');
  }
  if (!addresses.length) throw new RelayEndpointError('dns_no_public_address');
  if (addresses.some((address) => !isPublicRelayAddress(address))) throw new RelayEndpointError('unsafe_relay_address');
  return { host, addresses: [...new Set(addresses)] };
}
