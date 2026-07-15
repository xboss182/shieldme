import { describe, expect, it } from 'vitest';
import { buildForwardBanner, buildForwardBannerText } from './forward-banner.js';

const baseOptions = {
  aliasAddress: 'alias@example.com',
  originalSender: 'sender@example.net',
  dashboardUrl: 'https://app.shieldme.cc/aliases',
};

describe('forward banner', () => {
  it('shows a tracking protection label when enabled', () => {
    const html = buildForwardBanner({
      ...baseOptions,
      trackingProtection: { enabled: true, pixelsRemoved: 2, linksRewritten: 1 },
    });
    const text = buildForwardBannerText({
      ...baseOptions,
      trackingProtection: { enabled: true, pixelsRemoved: 2, linksRewritten: 1 },
    });

    expect(html).toContain('Tracking protection');
    expect(html).toContain('removed 2 tracking pixels and cleaned 1 link');
    expect(text).toContain('Tracking protection: removed 2 tracking pixels and cleaned 1 link.');
  });

  it('omits the tracking protection label when disabled', () => {
    const html = buildForwardBanner(baseOptions);
    const text = buildForwardBannerText(baseOptions);

    expect(html).not.toContain('Tracking protection');
    expect(text).not.toContain('Tracking protection:');
  });
});
