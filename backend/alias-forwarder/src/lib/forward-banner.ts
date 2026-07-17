export interface BannerOptions {
  matchedAlias: string;
  dashboardUrl: string;
  trackingProtection?: TrackingProtectionNoticeOptions;
}

export interface TrackingProtectionNoticeOptions {
  enabled: boolean;
  pixelsRemoved: number;
  linksRewritten: number;
}

export function buildForwardBanner(opts: BannerOptions): string {
  const trackingSummary = buildTrackingProtectionSummary(opts.trackingProtection);
  const trackingStatus = trackingSummary
    ? ` &middot; <strong>Tracking protection:</strong> ${escapeHtml(trackingSummary)}`
    : '';

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0 0 16px 0;padding:0;max-width:100%;box-sizing:border-box;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:100%;table-layout:fixed;border-collapse:separate;box-sizing:border-box;">
    <tr>
      <td style="padding:12px 14px;background:#ecfdf5;border:1px solid #bbf7d0;border-radius:10px;color:#065f46;max-width:100%;box-sizing:border-box;overflow-wrap:anywhere;word-break:break-word;">
        <div style="margin:0;color:#065f46;font-size:14px;line-height:1.5;max-width:100%;overflow-wrap:anywhere;word-break:break-word;">
          Forwarded from <strong style="overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(opts.matchedAlias)}</strong> &middot; by <strong>ShieldMe.cc</strong>${trackingStatus} &middot; <a href="${escapeHtml(opts.dashboardUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#047857;border-radius:6px;padding:5px 10px;font-size:13px;color:#ffffff;text-decoration:none;font-weight:600;line-height:1.4;">Dashboard</a>
        </div>
      </td>
    </tr>
  </table>
</div>
`;
}

export function buildForwardBannerText(opts: BannerOptions): string {
  const trackingSummary = buildTrackingProtectionSummary(opts.trackingProtection);
  const trackingStatus = trackingSummary ? ` · Tracking protection: ${trackingSummary}` : '';
  return `[Forwarded from ${opts.matchedAlias} · by ShieldMe.cc${trackingStatus}] · Dashboard: ${opts.dashboardUrl}\n---\n`;
}

function buildTrackingProtectionSummary(opts?: TrackingProtectionNoticeOptions): string | undefined {
  if (!opts?.enabled) return undefined;

  const results: string[] = [];
  if (opts.pixelsRemoved > 0) {
    const pixelWord = opts.pixelsRemoved === 1 ? 'tracking pixel' : 'tracking pixels';
    results.push(`removed ${opts.pixelsRemoved} ${pixelWord}`);
  }
  if (opts.linksRewritten > 0) {
    const linkWord = opts.linksRewritten === 1 ? 'link' : 'links';
    results.push(`cleaned ${opts.linksRewritten} ${linkWord}`);
  }

  return results.length > 0 ? results.join(' and ') : undefined;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
