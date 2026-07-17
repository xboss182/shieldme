export interface BannerOptions {
  originalSender: string;
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
    ? `
        <div style="margin:8px 0 0 0;color:#065f46;font-size:13px;line-height:1.5;word-break:break-word;">
          <strong>Tracking protection:</strong> ${escapeHtml(trackingSummary)}
        </div>`
    : '';

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0 0 16px 0;padding:0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;">
    <tr>
      <td style="padding:14px 16px;background:#ecfdf5;border:1px solid #bbf7d0;border-radius:10px;color:#065f46;">
        <div style="margin:0;color:#065f46;font-size:14px;line-height:1.5;word-break:break-word;">
          Forwarded from <strong>${escapeHtml(opts.originalSender)}</strong> &middot; by <strong>ShieldMe.cc</strong>
        </div>${trackingStatus}
        <div style="margin:10px 0 0 0;">
          <a href="${escapeHtml(opts.dashboardUrl)}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;background:#047857;border-radius:6px;padding:7px 12px;font-size:13px;color:#ffffff;text-decoration:none;font-weight:600;line-height:1.4;">
            Open in Dashboard
          </a>
        </div>
      </td>
    </tr>
  </table>
</div>
`;
}

export function buildForwardBannerText(opts: BannerOptions): string {
  const trackingSummary = buildTrackingProtectionSummary(opts.trackingProtection);
  const trackingStatus = trackingSummary ? `\nTracking protection: ${trackingSummary}.` : '';
  return `[Forwarded from ${opts.originalSender} · by ShieldMe.cc]${trackingStatus}\nDashboard: ${opts.dashboardUrl}\n---\n`;
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
