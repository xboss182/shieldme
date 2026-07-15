import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Runtime config store — holds optional settings that can be configured
 * after startup via POST /api/admin/config without requiring a restart.
 *
 * Values here override env vars when present. The forwarding kill-switch is
 * persisted to a shared local JSON file so separate PM2 processes (API,
 * SMTP, worker) see the same launch-safety state.
 */

export type OutboundProvider = 'resend' | 'ses';

interface RuntimeConfig {
  resendApiKey?: string;
  platformDomain?: string;
  /** Global forwarding kill-switch. When false, all forwarding is disabled. */
  forwardingEnabled: boolean;
  /** Which outbound email provider to use. Defaults to 'resend'. */
  outboundProvider?: OutboundProvider;
}

interface PersistedRuntimeConfig {
  forwardingEnabled?: boolean;
  outboundProvider?: OutboundProvider;
}

const runtimeConfigPath = process.env['RUNTIME_CONFIG_PATH'] ?? join(process.cwd(), '.runtime-config.json');

const _store: RuntimeConfig = loadRuntimeConfig();

function loadRuntimeConfig(): RuntimeConfig {
  try {
    if (!existsSync(runtimeConfigPath)) return { forwardingEnabled: true };
    const parsed = JSON.parse(readFileSync(runtimeConfigPath, 'utf8')) as Partial<RuntimeConfig>;
    return {
      resendApiKey: typeof parsed.resendApiKey === 'string' ? parsed.resendApiKey : undefined,
      platformDomain: typeof parsed.platformDomain === 'string' ? parsed.platformDomain : undefined,
      forwardingEnabled: typeof parsed.forwardingEnabled === 'boolean' ? parsed.forwardingEnabled : true,
      outboundProvider: parsed.outboundProvider === 'ses' ? 'ses' : parsed.outboundProvider === 'resend' ? 'resend' : undefined,
    };
  } catch {
    return { forwardingEnabled: true };
  }
}

function persistRuntimeConfig(): void {
  const persisted: PersistedRuntimeConfig = {
    forwardingEnabled: _store.forwardingEnabled,
    outboundProvider: _store.outboundProvider,
  };
  writeFileSync(runtimeConfigPath, `${JSON.stringify(persisted, null, 2)}\n`, { mode: 0o600 });
}

function refreshRuntimeConfig(): RuntimeConfig {
  const latest = loadRuntimeConfig();
  _store.forwardingEnabled = latest.forwardingEnabled;
  return _store;
}

export function getRuntimeConfig(): Readonly<RuntimeConfig> {
  return refreshRuntimeConfig();
}

export function setRuntimeConfig(patch: Partial<RuntimeConfig>): void {
  if (patch.resendApiKey !== undefined) _store.resendApiKey = patch.resendApiKey;
  if (patch.platformDomain !== undefined) _store.platformDomain = patch.platformDomain;
  if (patch.forwardingEnabled !== undefined) _store.forwardingEnabled = patch.forwardingEnabled;
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

/** Which outbound provider is active: runtime override > env var > default 'resend' */
export function getOutboundProvider(): OutboundProvider {
  const stored = refreshRuntimeConfig().outboundProvider;
  if (stored) return stored;
  const env = process.env['OUTBOUND_PROVIDER'];
  if (env === 'ses' || env === 'resend') return env;
  return 'resend';
}

/** Is the active outbound provider fully configured? */
export function isOutboundConfigured(): boolean {
  const provider = getOutboundProvider();
  if (provider === 'ses') {
    return Boolean(
      (process.env['AWS_ACCESS_KEY_ID'] || process.env['AWS_PROFILE']) &&
      process.env['AWS_REGION'],
    );
  }
  // resend
  return Boolean(getResendApiKey());
}
