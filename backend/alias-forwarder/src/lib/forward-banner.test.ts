import { describe, expect, it } from 'vitest';
import { buildForwardBanner, buildForwardBannerText } from './forward-banner.js';

const baseOptions = {
  originalSender: 'sender@senderdomain.test',
  dashboardUrl: 'https://app.shieldme.cc/aliases',
};

describe('forward banner', () => {
  it('renders one responsive green banner with the original sender and dashboard action', () => {
    const html = buildForwardBanner(baseOptions);
    const text = buildForwardBannerText(baseOptions);

    expect(html.match(/background:#ecfdf5/g)).toHaveLength(1);
    expect(html).not.toContain('background:#f4f4f5');
    expect(html).toContain('width="100%"');
    expect(html).toContain('word-break:break-word');
    expect(html).toContain('Forwarded from <strong>sender@senderdomain.test</strong>');
    expect(html).toContain('&middot; by <strong>ShieldMe.cc</strong>');
    expect(html).toContain('href="https://app.shieldme.cc/aliases"');
    expect(html).toContain('Open in Dashboard');
    expect(text).toContain('Forwarded from sender@senderdomain.test · by ShieldMe.cc');
    expect(text).toContain('Dashboard: https://app.shieldme.cc/aliases');
  });

  it('omits all tracking wording when protection has zero impact', () => {
    const options = {
      ...baseOptions,
      trackingProtection: { enabled: true, pixelsRemoved: 0, linksRewritten: 0 },
    };
    const html = buildForwardBanner(options);
    const text = buildForwardBannerText(options);

    expect(html).not.toContain('Tracking protection');
    expect(text).not.toContain('Tracking protection');
    expect(html).not.toContain('0 tracking pixels');
    expect(html).not.toContain('0 cleaned links');
    expect(text).not.toContain('0 tracking pixels');
    expect(text).not.toContain('0 cleaned links');
  });

  it('renders truthful nonzero pixel and link counts inside the unified banner', () => {
    const options = {
      ...baseOptions,
      trackingProtection: { enabled: true, pixelsRemoved: 2, linksRewritten: 1 },
    };
    const html = buildForwardBanner(options);
    const text = buildForwardBannerText(options);

    expect(html.match(/background:#ecfdf5/g)).toHaveLength(1);
    expect(html).toContain('Tracking protection:');
    expect(html).toContain('removed 2 tracking pixels and cleaned 1 link');
    expect(text).toContain('Tracking protection: removed 2 tracking pixels and cleaned 1 link.');
  });

  it.each([
    [{ enabled: true, pixelsRemoved: 1, linksRewritten: 0 }, 'removed 1 tracking pixel', 'cleaned'],
    [{ enabled: true, pixelsRemoved: 0, linksRewritten: 3 }, 'cleaned 3 links', 'removed'],
  ])('renders only the nonzero tracking result', (trackingProtection, included, omitted) => {
    const html = buildForwardBanner({ ...baseOptions, trackingProtection });
    const text = buildForwardBannerText({ ...baseOptions, trackingProtection });

    expect(html).toContain(included);
    expect(text).toContain(included);
    expect(html).not.toContain(omitted);
    expect(text).not.toContain(omitted);
  });

  it('escapes sender and dashboard values in HTML', () => {
    const html = buildForwardBanner({
      originalSender: 'sender+<tag>@senderdomain.test',
      dashboardUrl: 'https://app.shieldme.cc/aliases?filter="active"&sort=newest',
    });

    expect(html).toContain('sender+&lt;tag&gt;@senderdomain.test');
    expect(html).toContain('filter=&quot;active&quot;&amp;sort=newest');
  });
});
