/**
 * Pure parsing of the RFC 8601 `Authentication-Results` header.
 *
 * Extracted from inbound.service.ts so it can be reused (reverse-reply sender
 * authenticity, MNC-708 Stage 2) and unit-tested WITHOUT importing the DB
 * client / env (which throw at import time when env is absent). inbound.service
 * re-exports these for backward compatibility.
 */

export interface MailAuthResults extends Record<string, unknown> {
  source: 'authentication-results-header' | 'smtp-session-unavailable';
  spf: 'pass' | 'fail' | 'softfail' | 'neutral' | 'none' | 'temperror' | 'permerror' | 'unknown';
  dkim: 'pass' | 'fail' | 'neutral' | 'none' | 'temperror' | 'permerror' | 'unknown';
  dmarc: 'pass' | 'fail' | 'bestguesspass' | 'none' | 'temperror' | 'permerror' | 'unknown';
  raw?: string;
}

function normalizeHeaderKey(headers: Record<string, string>, key: string): string | undefined {
  return headers[key] ?? headers[key.toLowerCase()] ?? Object.entries(headers).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1];
}

function parseAuthToken(raw: string, token: 'spf' | 'dkim' | 'dmarc'): string {
  for (const part of raw.split(';')) {
    const trimmed = part.trim().toLowerCase();
    if (trimmed.startsWith(`${token}=`)) return trimmed.slice(token.length + 1).split(/\s+/)[0] ?? 'unknown';
  }
  return 'unknown';
}

export function countAuthFailures(results: MailAuthResults | null): number {
  if (!results) return 0;
  return [results.spf, results.dkim, results.dmarc].filter((value) => ['fail', 'softfail', 'permerror'].includes(value as string)).length;
}

export function parseMailAuthResults(headers?: Record<string, string>): { results: MailAuthResults | null; failureCount: number } {
  const raw = headers ? normalizeHeaderKey(headers, 'Authentication-Results') : undefined;
  if (!raw) {
    const results: MailAuthResults = { source: 'smtp-session-unavailable', spf: 'unknown', dkim: 'unknown', dmarc: 'unknown' };
    return { results, failureCount: 0 };
  }

  const results: MailAuthResults = {
    source: 'authentication-results-header',
    spf: parseAuthToken(raw, 'spf') as MailAuthResults['spf'],
    dkim: parseAuthToken(raw, 'dkim') as MailAuthResults['dkim'],
    dmarc: parseAuthToken(raw, 'dmarc') as MailAuthResults['dmarc'],
    raw: raw.slice(0, 1000),
  };
  return { results, failureCount: countAuthFailures(results) };
}
