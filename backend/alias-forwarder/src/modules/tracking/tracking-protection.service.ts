export type TrackingProtectionMode = 'conservative' | 'aggressive';

export type TrackingProtectionConfig = {
  enabled: boolean;
  mode: TrackingProtectionMode;
};

export type TrackingProtectionMetadata = {
  enabled: boolean;
  mode: TrackingProtectionMode;
  pixelsRemoved: number;
  linksRewritten: number;
};

const TRACKING_QUERY_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'mc_cid', 'mc_eid', 'mkt_tok', 'vero_id', '_hsenc', '_hsmi', 'igshid', 'fbclid',
  'gclid', 'dclid', 'yclid', 'msclkid', 'twclid', 'wickedid', 'oly_enc_id', 'oly_anon_id',
]);

function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function getAttribute(tag: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = tag.match(re);
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null;
}

function isTrackingPixel(tag: string, mode: TrackingProtectionMode): boolean {
  const src = getAttribute(tag, 'src') ?? '';
  if (!isRemoteUrl(src)) return false;

  const width = (getAttribute(tag, 'width') ?? '').trim();
  const height = (getAttribute(tag, 'height') ?? '').trim();
  const style = (getAttribute(tag, 'style') ?? '').toLowerCase();

  const tiny = (width === '1' || width === '0') && (height === '1' || height === '0');
  const hidden = style.includes('display:none') || style.includes('display: none') || style.includes('visibility:hidden') || style.includes('opacity:0') || /hidden\b/i.test(tag);
  const beaconName = /\/(open|track|tracking|pixel|beacon)[^/]*\.(?:gif|png|jpg|jpeg|webp)(?:[?#]|$)/i.test(src);

  return tiny || hidden || (mode === 'aggressive' && beaconName);
}

function stripTrackingParams(rawUrl: string): string | null {
  if (!isRemoteUrl(rawUrl)) return null;
  try {
    const url = new URL(rawUrl);
    let changed = false;
    for (const key of Array.from(url.searchParams.keys())) {
      if (TRACKING_QUERY_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    return changed ? url.toString() : null;
  } catch {
    return null;
  }
}

export function protectEmailTracking(html: string, config: TrackingProtectionConfig): { html: string; metadata: TrackingProtectionMetadata } {
  const metadata: TrackingProtectionMetadata = {
    enabled: config.enabled,
    mode: config.mode,
    pixelsRemoved: 0,
    linksRewritten: 0,
  };

  if (!config.enabled) return { html, metadata };

  let protectedHtml = html.replace(/<img\b[^>]*>/gi, (tag) => {
    if (!isTrackingPixel(tag, config.mode)) return tag;
    metadata.pixelsRemoved += 1;
    return '';
  });

  protectedHtml = protectedHtml.replace(/\bhref\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (attr, quoted) => {
    const quote = quoted.startsWith('"') || quoted.startsWith("'") ? quoted[0] : '';
    const value = quote ? quoted.slice(1, -1) : quoted;
    const stripped = stripTrackingParams(value);
    if (!stripped) return attr;
    metadata.linksRewritten += 1;
    return `href=${quote}${stripped}${quote}`;
  });

  return { html: protectedHtml, metadata };
}
