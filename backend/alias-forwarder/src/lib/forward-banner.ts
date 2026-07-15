/**
 * Generates an HTML info banner to prepend to forwarded emails.
 * Similar to BumpMail/SimpleLogin — shows which alias forwarded the
 * email and provides a link to the dashboard.
 */

export interface BannerOptions {
  aliasAddress: string;
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
  const { aliasAddress, originalSender, dashboardUrl } = opts;
  const trackingNotice = buildTrackingProtectionNotice(opts.trackingProtection);

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0 0 16px 0;padding:0;">
  ${trackingNotice}
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr>
      <td style="padding:12px 16px;background:#f4f4f5;border-radius:10px;">
        <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr>
            <!-- Forwarding info pill -->
            <td style="padding:0 8px 0 0;vertical-align:middle;">
              <span style="display:inline-block;background:#e8e8ed;border-radius:14px;padding:6px 14px;font-size:13px;color:#3c3c43;line-height:1.4;">
                &#9993;&nbsp; Forwarded from <strong>${escapeHtml(aliasAddress)}</strong>
                &nbsp;&middot;&nbsp; sent by <strong>${escapeHtml(originalSender)}</strong>
              </span>
            </td>
            <!-- Dashboard link pill -->
            <td style="padding:0;vertical-align:middle;">
              <a href="${escapeHtml(dashboardUrl)}" target="_blank" rel="noopener noreferrer"
                 style="display:inline-block;background:#2563eb;border-radius:14px;padding:6px 16px;font-size:13px;color:#ffffff;text-decoration:none;font-weight:600;line-height:1.4;">
                Open in Dashboard
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
`;
}

/**
 * Generates a plain-text version of the forwarding banner.
 */
export function buildForwardBannerText(opts: BannerOptions): string {
  const trackingNotice = buildTrackingProtectionNoticeText(opts.trackingProtection);
  return `${trackingNotice}[Forwarded from ${opts.aliasAddress} · sent by ${opts.originalSender}] — Dashboard: ${opts.dashboardUrl}\n---\n`;
}

export function buildTrackingProtectionNotice(opts?: TrackingProtectionNoticeOptions): string {
  if (!opts?.enabled) return '';
  const summary = buildTrackingProtectionSummary(opts);
  return `
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 8px 0;">
    <tr>
      <td style="padding:10px 14px;background:#ecfdf5;border:1px solid #bbf7d0;border-radius:10px;color:#065f46;font-size:13px;line-height:1.4;">
        🛡️ <strong>Tracking protection</strong> ${escapeHtml(summary)}
      </td>
    </tr>
  </table>`;
}

export function buildTrackingProtectionNoticeText(opts?: TrackingProtectionNoticeOptions): string {
  if (!opts?.enabled) return '';
  return `Tracking protection: ${buildTrackingProtectionSummary(opts)}.\n`;
}

function buildTrackingProtectionSummary(opts: TrackingProtectionNoticeOptions): string {
  const pixelWord = opts.pixelsRemoved === 1 ? 'tracking pixel' : 'tracking pixels';
  const linkWord = opts.linksRewritten === 1 ? 'link' : 'links';
  return `removed ${opts.pixelsRemoved} ${pixelWord} and cleaned ${opts.linksRewritten} ${linkWord}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
