import SpamScanner from 'spamscanner';
import { logger } from '../../lib/logger.js';

export type SpamScannerActionMode = 'tag' | 'reject' | 'quarantine';
export interface SpamScanMetadata extends Record<string, unknown> {
  enabled: boolean;
  score: number;
  category: 'clean' | 'spam' | 'error';
  reason: string;
  action: 'allow' | 'tag' | 'reject' | 'quarantine';
}

interface SpamScannerResult {
  isSpam?: boolean;
  message?: string;
  results?: {
    classification?: { category?: string; probability?: number };
    phishing?: unknown[];
    viruses?: unknown[];
    executables?: unknown[];
    arbitrary?: { score?: number; reasons?: string[] } | unknown[];
  };
}

const scanner = new SpamScanner({
  timeout: Number(process.env['SPAM_SCANNER_TIMEOUT_MS'] ?? 15000),
  enableNsfwDetection: false,
  enableToxicityDetection: false,
  enableReputation: false,
  logger: {
    log: (...args: unknown[]) => logger.debug({ args }, 'SpamScanner log'),
    info: (...args: unknown[]) => logger.debug({ args }, 'SpamScanner info'),
    debug: (...args: unknown[]) => logger.debug({ args }, 'SpamScanner debug'),
    warn: (...args: unknown[]) => logger.warn({ args }, 'SpamScanner warn'),
    error: (...args: unknown[]) => logger.warn({ args }, 'SpamScanner error'),
  },
});

export function isSpamScannerEnabled(): boolean {
  const raw = process.env['SPAM_SCANNER_ENABLED']?.toLowerCase().trim();
  return raw !== 'false' && raw !== '0' && raw !== 'off';
}

export function getSpamScannerThreshold(): number {
  const raw = Number(process.env['SPAM_SCANNER_THRESHOLD'] ?? 0.9);
  if (!Number.isFinite(raw)) return 0.9;
  return Math.min(Math.max(raw, 0), 1);
}

export function getSpamScannerActionMode(): SpamScannerActionMode {
  const raw = process.env['SPAM_SCANNER_ACTION']?.toLowerCase().trim();
  if (raw === 'reject' || raw === 'quarantine') return raw;
  return 'tag';
}

function escapeHeader(value: string | undefined): string {
  return (value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function buildScanSource(input: { from: string; to: string; subject?: string; textBody?: string; htmlBody?: string; rawMessage?: Buffer | string; }): Buffer | string {
  if (input.rawMessage) return input.rawMessage;
  const text = input.textBody ?? '';
  const html = input.htmlBody;
  if (!html) {
    return [`From: ${escapeHeader(input.from)}`, `To: ${escapeHeader(input.to)}`, `Subject: ${escapeHeader(input.subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', '', text].join('\r\n');
  }
  const boundary = `----=_ShieldMeSpamScan_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return [`From: ${escapeHeader(input.from)}`, `To: ${escapeHeader(input.to)}`, `Subject: ${escapeHeader(input.subject)}`, 'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${boundary}"`, '', `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', '', text, '', `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', '', html, '', `--${boundary}--`].join('\r\n');
}

function arrayLength(value: unknown): number { return Array.isArray(value) ? value.length : 0; }

function extractScore(result: SpamScannerResult): number {
  const classification = result.results?.classification;
  const classificationScore = classification?.category === 'spam' && typeof classification.probability === 'number' ? classification.probability : 0;
  const arbitrary = result.results?.arbitrary;
  const arbitraryScore = !Array.isArray(arbitrary) && typeof arbitrary?.score === 'number' ? arbitrary.score : 0;
  const signalScore = Math.min(1, arrayLength(result.results?.phishing) * 0.35 + arrayLength(result.results?.viruses) + arrayLength(result.results?.executables) * 0.5);
  return Math.max(result.isSpam ? 1 : 0, classificationScore, arbitraryScore, signalScore);
}

function extractReason(result: SpamScannerResult): string {
  if (typeof result.message === 'string' && result.message.trim()) return result.message.slice(0, 500);
  const reasons: string[] = [];
  const arbitrary = result.results?.arbitrary;
  if (!Array.isArray(arbitrary) && Array.isArray(arbitrary?.reasons)) reasons.push(...arbitrary.reasons.map(String));
  if (arrayLength(result.results?.phishing)) reasons.push('phishing');
  if (arrayLength(result.results?.viruses)) reasons.push('virus');
  if (arrayLength(result.results?.executables)) reasons.push('executable_attachment');
  return reasons.join(', ').slice(0, 500) || 'clean';
}

export async function scanInboundMail(input: { from: string; to: string; subject?: string; textBody?: string; htmlBody?: string; rawMessage?: Buffer | string; }): Promise<SpamScanMetadata> {
  if (!isSpamScannerEnabled()) return { enabled: false, score: 0, category: 'clean', reason: 'scanner_disabled', action: 'allow' };
  try {
    const result = await scanner.scan(buildScanSource(input)) as SpamScannerResult;
    const score = extractScore(result);
    const isSpam = Boolean(result.isSpam) || score >= getSpamScannerThreshold();
    const action = isSpam ? getSpamScannerActionMode() : 'allow';
    return { enabled: true, score, category: isSpam ? 'spam' : 'clean', reason: extractReason(result), action };
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Spam scan failed; allowing mail conservatively');
    return { enabled: true, score: 0, category: 'error', reason: 'scan_error', action: 'allow' };
  }
}

export function buildSpamHeaders(scan: SpamScanMetadata): Record<string, string> {
  if (!scan.enabled) return { 'X-ShieldMe-Spam-Scanner': 'disabled' };
  return { 'X-ShieldMe-Spam-Scanner': 'spamscanner', 'X-ShieldMe-Spam-Status': scan.category === 'spam' ? 'Yes' : 'No', 'X-ShieldMe-Spam-Score': scan.score.toFixed(3), 'X-ShieldMe-Spam-Action': scan.action, 'X-ShieldMe-Spam-Reason': scan.reason.replace(/[\r\n]+/g, ' ').slice(0, 200) };
}

export function tagSubject(subject: string, scan: SpamScanMetadata): string {
  if (scan.action !== 'tag' || scan.category !== 'spam') return subject;
  return /^\[SPAM\]/i.test(subject) ? subject : `[SPAM] ${subject}`;
}
