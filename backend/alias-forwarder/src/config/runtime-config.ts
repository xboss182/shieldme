import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRelayKmsConfigured } from '../modules/smtp-relays/crypto.js';

/**
 * Runtime config store — holds optional settings that can be configured
 * after startup via POST /api/admin/config without requiring a restart.
 *
 * Values here override env vars when present. The forwarding kill-switch is
 * persisted to a shared local JSON file so separate PM2 processes (API,
 * SMTP, worker) see the same launch-safety state.
 */

/** Active selectable outbound providers. SES removed from all active paths. */
export type OutboundProvider = 'mailbaby' | 'resend';

interface RuntimeConfig {
  resendApiKey?: string;
  platformDomain?: string;
  /** Global forwarding kill-switch. When false, all forwarding is disabled. */
  forwardingEnabled: boolean;
  /** Global BYO SMTP kill-switch. False by default and persisted separately. */
  byoSmtpEnabled: boolean;
  /** Which outbound email provider to use. Defaults to 'mailbaby'. */
  outboundProvider?: OutboundProvider;
}

interface PersistedRuntimeConfig {
  forwardingEnabled?: boolean;
  byoSmtpEnabled?: boolean;
  outboundProvider?: OutboundProvider;
}

const runtimeConfigPath = process.env['RUNTIME_CONFIG_PATH'] ?? join(process.cwd(), '.runtime-config.json');

const _store: RuntimeConfig = loadRuntimeConfig();

function loadRuntimeConfig(): RuntimeConfig {
  try {
    if (!existsSync(runtimeConfigPath)) return { forwardingEnabled: true, byoSmtpEnabled: false };
    const parsed = JSON.parse(readFileSync(runtimeConfigPath, 'utf8')) as Partial<RuntimeConfig>;
    return {
      resendApiKey: typeof parsed.resendApiKey === 'string' ? parsed.resendApiKey : undefined,
      platformDomain: typeof parsed.platformDomain === 'string' ? parsed.platformDomain : undefined,
      forwardingEnabled: typeof parsed.forwardingEnabled === 'boolean' ? parsed.forwardingEnabled : true,
      byoSmtpEnabled: typeof parsed.byoSmtpEnabled === 'boolean' ? parsed.byoSmtpEnabled : false,
      outboundProvider: parsed.outboundProvider === 'resend' ? 'resend' : parsed.outboundProvider === 'mailbaby' ? 'mailbaby' : undefined,
    };
  } catch {
    return { forwardingEnabled: true, byoSmtpEnabled: false };
  }
}

function persistRuntimeConfig(): void {
  const persisted: PersistedRuntimeConfig = {
    forwardingEnabled: _store.forwardingEnabled,
    byoSmtpEnabled: _store.byoSmtpEnabled,
    outboundProvider: _store.outboundProvider,
  };
  writeFileSync(runtimeConfigPath, `${JSON.stringify(persisted, null, 2)}\n`, { mode: 0o600 });
}

function refreshRuntimeConfig(): RuntimeConfig {
  const latest = loadRuntimeConfig();
  _store.forwardingEnabled = latest.forwardingEnabled;
  _store.byoSmtpEnabled = latest.byoSmtpEnabled;
  return _store;
}

export function getRuntimeConfig(): Readonly<RuntimeConfig> {
  return refreshRuntimeConfig();
}

export function setRuntimeConfig(patch: Partial<RuntimeConfig>): void {
  if (patch.resendApiKey !== undefined) _store.resendApiKey = patch.resendApiKey;
  if (patch.platformDomain !== undefined) _store.platformDomain = patch.platformDomain;
  if (patch.forwardingEnabled !== undefined) _store.forwardingEnabled = patch.forwardingEnabled;
  if (patch.byoSmtpEnabled !== undefined) _store.byoSmtpEnabled = patch.byoSmtpEnabled;
  if (patch.outboundProvider !== undefined) _store.outboundProvider = patch.outboundProvider;
  persistRuntimeConfig();
}

/** Effective Resend API key: runtime override > env var */
export function getResendApiKey(): string | undefined {
  return refreshRuntimeConfig().resendApiKey ?? process.env['RESEND_API_KEY'];
}

/** Effective platform domain: runtime override > env var */
export function getPlatformDomain(): string | undefined {
  return refreshRuntimeConfig().platformDomain ?? process.env['PLATFORM_DOMAIN'];
}

/** Is global forwarding enabled? */
export function isForwardingEnabled(): boolean {
  return refreshRuntimeConfig().forwardingEnabled;
}

export function isByoSmtpRuntimeEnabled(): boolean {
  return refreshRuntimeConfig().byoSmtpEnabled;
}

export function isByoSmtpEnabledForOwner(ownerId: string): boolean {
  return process.env['BYO_SMTP_ENABLED'] === 'true'
    && isRelayKmsConfigured()
    && isByoSmtpRuntimeEnabled()
    && (process.env['BYO_SMTP_PILOT_OWNER_IDS'] ?? '').split(',').map((id) => id.trim()).includes(ownerId);
}

export function isApprovedRelayHost(host: string): boolean {
  return (process.env['BYO_SMTP_APPROVED_HOSTS'] ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean).includes(host.toLowerCase());
}

/** Which outbound provider is active: runtime override > env var > default 'mailbaby' */
export function getOutboundProvider(): OutboundProvider {
  const stored = refreshRuntimeConfig().outboundProvider;
  if (stored) return stored;
  const env = process.env['OUTBOUND_PROVIDER'];
  if (env === 'resend' || env === 'mailbaby') return env;
  return 'mailbaby';
}

/** Is the active outbound provider fully configured? */
export function isOutboundConfigured(explicitProvider?: OutboundProvider): boolean {
  const provider = explicitProvider ?? getOutboundProvider();
  if (provider === 'mailbaby') {
    return Boolean(process.env['MAILBABY_SMTP_USERNAME'] && process.env['MAILBABY_SMTP_PASSWORD']);
  }
  // resend
  return Boolean(getResendApiKey());
}
