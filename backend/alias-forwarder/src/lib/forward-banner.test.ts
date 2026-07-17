import { describe, expect, it } from 'vitest';
import { buildForwardBanner, buildForwardBannerText } from './forward-banner.js';

const baseOptions = {
  matchedAlias: 'netflix-2sdf7@shieldme.cc',
  dashboardUrl: 'https://app.shieldme.cc/aliases',
};

describe('forward banner', () => {
  it('renders the matched alias, brand, and unchanged Dashboard action in one inline flow', () => {
    const html = buildForwardBanner(baseOptions);
    const text = buildForwardBannerText(baseOptions);

    expect(html.match(/background:#ecfdf5/g)).toHaveLength(1);
    expect(html).not.toContain('background:#f4f4f5');
    expect(html).toContain('Forwarded from <strong');
    expect(html).toContain('netflix-2sdf7@shieldme.cc</strong> &middot; by <strong>ShieldMe.cc</strong>');
    expect(html).toContain('href="https://app.shieldme.cc/aliases" target="_blank" rel="noopener noreferrer"');
    expect(html).toMatch(/>\s*Dashboard\s*<\/a>/);
    expect(html).not.toContain('Open in Dashboard');
    expect(html).not.toMatch(/<\/span>\s*<\/div>[\s\S]*<a /);
    expect(text).toContain('Forwarded from netflix-2sdf7@shieldme.cc · by ShieldMe.cc');
    expect(text).toContain('Dashboard: https://app.shieldme.cc/aliases');
  });

  it('uses email-safe natural wrapping without clipping or forced no-wrap behavior', () => {
    const html = buildForwardBanner({
      ...baseOptions,
      matchedAlias: 'a-very-long-generated-alias-that-must-wrap-safely-2sdf7@shieldme.cc',
    });

    expect(html).toContain('width="100%"');
    expect(html).toContain('max-width:100%');
    expect(html).toContain('table-layout:fixed');
    expect(html).toContain('box-sizing:border-box');
    expect(html).toContain('overflow-wrap:anywhere');
    expect(html).toContain('word-break:break-word');
    expect(html).not.toContain('white-space:nowrap');
    expect(html).not.toContain('overflow:hidden');
    expect(html).not.toContain('<br');
  });

  it('omits all tracking wording and its separator when protection has zero impact', () => {
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
    expect(html.match(/&middot;/g)).toHaveLength(2);
    expect(text.match(/ · /g)).toHaveLength(2);
    expect(text).not.toContain('ShieldMe.cc · · Dashboard');
  });

  it.each([
    [{ enabled: true, pixelsRemoved: 1, linksRewritten: 0 }, 'removed 1 tracking pixel', 'cleaned'],
    [{ enabled: true, pixelsRemoved: 0, linksRewritten: 3 }, 'cleaned 3 links', 'removed'],
    [{ enabled: true, pixelsRemoved: 2, linksRewritten: 1 }, 'removed 2 tracking pixels and cleaned 1 link', ''],
  ])('renders only truthful nonzero tracking results', (trackingProtection, included, omitted) => {
    const html = buildForwardBanner({ ...baseOptions, trackingProtection });
    const text = buildForwardBannerText({ ...baseOptions, trackingProtection });

    expect(html).toContain(`&middot; <strong>Tracking protection:</strong> ${included}`);
    expect(text).toContain(`· Tracking protection: ${included}`);
    if (omitted) {
      expect(html).not.toContain(omitted);
      expect(text).not.toContain(omitted);
    }
  });

  it('escapes the matched alias and dashboard destination in HTML', () => {
    const html = buildForwardBanner({
      matchedAlias: 'netflix+<tag>@shieldme.cc',
      dashboardUrl: 'https://app.shieldme.cc/aliases?filter="active"&sort=newest',
    });

    expect(html).toContain('netflix+&lt;tag&gt;@shieldme.cc');
    expect(html).toContain('filter=&quot;active&quot;&amp;sort=newest');
    expect(html).not.toContain('netflix+<tag>@shieldme.cc');
  });
});
