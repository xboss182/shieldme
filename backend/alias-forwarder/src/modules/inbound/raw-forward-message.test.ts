import { describe, expect, it } from 'vitest';
import { rewriteRawForwardMessage } from './raw-forward-message.js';

const source = Buffer.from([
  'Received: from mx.sender.test by ingress.shieldme.cc',
  'Authentication-Results: mx.sender.test; dkim=pass',
  'DKIM-Signature: v=1; d=sender.test; b=old',
  'X-Google-DKIM-Signature: v=1; d=sender.test; b=old',
  'X-ShieldMe-Old-Policy: obsolete',
  'Resent-From: Sender <sender@sender.test>',
  'From: Sender <sender@sender.test>',
  'To: alias@shieldme.cc',
  'Reply-To: sender@sender.test',
  'Message-ID: <original@sender.test>',
  'In-Reply-To: <parent@sender.test>',
  'References: <root@sender.test> <parent@sender.test>',
  'Subject: multipart test',
  'Content-Type: multipart/related; boundary="mix"',
  '',
  '--mix',
  'Content-Type: text/html',
  '',
  '<img src="cid:logo@sender.test">',
  '--mix',
  'Content-Type: image/png',
  'Content-ID: <logo@sender.test>',
  'Content-Transfer-Encoding: base64',
  'Content-Disposition: inline; filename="logo.png"',
  '',
  'AAECA/8=',
  '--mix--',
].join('\r\n'), 'latin1');

describe('rewriteRawForwardMessage', () => {
  it('preserves multipart bytes, attachments, inline CID, and thread headers while replacing unsafe identity headers', () => {
    const result = rewriteRawForwardMessage({
      rawMessage: source,
      from: 'ShieldMe <forwarded+alias@shieldme.cc>',
      to: 'owner@example.net',
      replyTo: 'sender@sender.test',
      originalFrom: 'sender@sender.test',
      originalMessageId: '<original@sender.test>',
      forwardedAlias: 'alias@shieldme.cc',
      messageIdDomain: 'shieldme.cc',
      headers: { 'X-ShieldMe-Spam-Status': 'No' },
    });
    const rewritten = result.message;
    const separator = rewritten.indexOf(Buffer.from('\r\n\r\n'));
    const headers = rewritten.subarray(0, separator).toString('latin1');
    const body = rewritten.subarray(separator + 4);

    expect(headers).toContain('From: ShieldMe <forwarded+alias@shieldme.cc>');
    expect(headers).toContain('To: owner@example.net');
    expect(headers).toContain('Reply-To: sender@sender.test');
    expect(headers).toContain('X-Original-Sender: sender@sender.test');
    expect(headers).toContain('X-Original-Message-ID: <original@sender.test>');
    expect(headers).toContain('In-Reply-To: <parent@sender.test>');
    expect(headers).toContain('References: <root@sender.test> <parent@sender.test>');
    expect(headers).not.toContain('From: Sender <sender@sender.test>');
    expect(headers).not.toContain('To: alias@shieldme.cc');
    expect(headers).not.toContain('\r\nMessage-ID: <original@sender.test>');
    expect(headers).not.toContain('DKIM-Signature:');
    expect(headers).not.toContain('X-Google-DKIM-Signature:');
    expect(headers).not.toContain('Resent-From:');
    expect(headers).not.toContain('Authentication-Results:');
    expect(headers).not.toContain('Received:');
    expect(headers).toContain('X-ShieldMe-Spam-Status: No');
    expect(headers).not.toContain('X-ShieldMe-Old-Policy:');
    expect(headers).not.toContain('<original@sender.test>\r\nIn-Reply-To');
    expect(body.equals(source.subarray(source.indexOf(Buffer.from('\r\n\r\n')) + 4))).toBe(true);
    expect(body.toString('latin1')).toContain('Content-ID: <logo@sender.test>');
    expect(body.toString('latin1')).toContain('AAECA/8=');
  });

  it('deduplicates override headers passed in options.headers when present in rawMessage', () => {
    const result = rewriteRawForwardMessage({
      rawMessage: source,
      from: 'ShieldMe <forwarded+alias@shieldme.cc>',
      to: 'owner@example.net',
      forwardedAlias: 'alias@shieldme.cc',
      messageIdDomain: 'shieldme.cc',
      headers: {
        'In-Reply-To': '<override-parent@sender.test>',
      },
    });
    const rewritten = result.message.toString('latin1');
    const matches = rewritten.match(/^In-Reply-To:/gm);
    expect(matches?.length).toBe(1);
    expect(rewritten).toContain('In-Reply-To: <override-parent@sender.test>');
    expect(rewritten).not.toContain('In-Reply-To: <parent@sender.test>');
  });
});
