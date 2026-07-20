import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isByoSmtpRuntimeEnabled, isForwardingEnabled, setRuntimeConfig } from './runtime-config.js';

const runtimeConfigPath = join(process.cwd(), '.runtime-config.json');

afterEach(() => {
  setRuntimeConfig({ forwardingEnabled: true, byoSmtpEnabled: false });
  if (existsSync(runtimeConfigPath)) unlinkSync(runtimeConfigPath);
});

describe('runtime forwarding kill-switch config', () => {
  it('persists forwardingEnabled to shared runtime config file', () => {
    setRuntimeConfig({ forwardingEnabled: false });
    expect(isForwardingEnabled()).toBe(false);

  setRuntimeConfig({ forwardingEnabled: true, byoSmtpEnabled: false });
    expect(isForwardingEnabled()).toBe(true);
  });

  it('refreshes forwardingEnabled from shared state written by another process', () => {
    writeFileSync(runtimeConfigPath, `${JSON.stringify({ forwardingEnabled: false })}
`, { mode: 0o600 });
    expect(isForwardingEnabled()).toBe(false);

    writeFileSync(runtimeConfigPath, `${JSON.stringify({ forwardingEnabled: true })}
`, { mode: 0o600 });
    expect(isForwardingEnabled()).toBe(true);
  });

  it('defaults the separate BYO SMTP switch off and persists it independently', () => {
    expect(isByoSmtpRuntimeEnabled()).toBe(false);
    setRuntimeConfig({ byoSmtpEnabled: true });
    expect(isByoSmtpRuntimeEnabled()).toBe(true);
  });
});
