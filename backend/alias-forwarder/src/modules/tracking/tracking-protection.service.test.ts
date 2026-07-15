import { describe, it, expect } from 'vitest';
import { protectEmailTracking } from './tracking-protection.service.js';

describe('protectEmailTracking', () => {
  it('removes hidden remote tracking pixels and records counts without body persistence', () => {
    const html = '<p>Hello</p><img src="https://tracker.example/open.gif?u=1" width="1" height="1" style="display:none"><img src="https://cdn.example/logo.png" width="120" height="60">';

    const result = protectEmailTracking(html, { enabled: true, mode: 'conservative' });

    expect(result.html).not.toContain('tracker.example/open.gif');
    expect(result.html).toContain('https://cdn.example/logo.png');
    expect(result.metadata).toEqual({ enabled: true, mode: 'conservative', pixelsRemoved: 1, linksRewritten: 0 });
  });

  it('strips common tracking query parameters while preserving legitimate link destination', () => {
    const html = '<a href="https://example.com/path?utm_source=newsletter&id=123&mc_eid=abc">Open</a>';

    const result = protectEmailTracking(html, { enabled: true, mode: 'aggressive' });

    expect(result.html).toContain('href="https://example.com/path?id=123"');
    expect(result.metadata.linksRewritten).toBe(1);
  });

  it('returns input unchanged when disabled', () => {
    const html = '<img src="https://tracker.example/open.gif" width="1" height="1">';

    const result = protectEmailTracking(html, { enabled: false, mode: 'conservative' });

    expect(result.html).toBe(html);
    expect(result.metadata.pixelsRemoved).toBe(0);
  });
});
